import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, botBattleSessionsTable, dailyOnFireWordsTable, storyProgressTable, topicalWordsTable } from "@workspace/db";
import {
  generateOpponentVerseWithClaude,
  judgeBattleWithClaude,
  type BattleScoreResult,
  type BattleTier,
  generateOnFireWordsWithClaude,
} from "../lib/ai";
import {
  GUEST_DAILY_LIMIT_MESSAGE,
  GUEST_GLOBAL_LIMIT_MESSAGE,
  incrementAiUsage,
} from "../lib/ai-usage";
import { getUserClass, insertBattleResult, recordScoredSession } from "../lib/supabase-admin";
import { activeTopicsForDate, applyOnFireMultiplier, battleTopicPairForDate, calculateBattleFinalScore, calculateClassAxisMultiplier, determineBattleWinner, onFireWordMatches, onFireWordsForDate, rerollTopics, type BattleClass } from "../lib/battle-topics";
import { containsBlockedTerm } from "../lib/content-policy";

const router: IRouter = Router();

const VALID_TIERS = new Set<BattleTier>(["bronze", "silver", "gold", "master"]);
const STORY_BATTLE_CONFIG = {
  battle_1: { tier: "bronze", botName: "Buzz" },
  battle_2: { tier: "silver", botName: "Rico" },
  boss_battle: { tier: "gold", botName: "Beef" },
} as const;
const dailyTopicCache = new Map<string, string[]>();
const onFireInFlight = new Map<string, Promise<{ words: string[]; source: "model" | "fallback" }>>();
const FALLBACK_RETRY_MS = 10 * 60 * 1000;

function utcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function dailyTopics(day: string): string[] {
  const cached = dailyTopicCache.get(day);
  if (cached) return cached;
  const topics = activeTopicsForDate(day);
  dailyTopicCache.set(day, topics);
  return topics;
}

function parseOnFireWords(raw: string): string[] {
  const words = raw.split(/[,\n]/).map((word) => word.trim().toLowerCase().replace(/^[^\p{L}]+|[^\p{L}'-]+$/gu, ""));
  return [...new Set(words)].filter((word) => /^[a-z]+(?:['-][a-z]+)?$/i.test(word) && !word.includes("-") && !containsBlockedTerm(word)).slice(0, 3);
}

async function dailyOnFireWords(day: string, tier: BattleTier, topics: string[], log: { warn: (data: unknown, message: string) => void }): Promise<{ words: string[]; source: "model" | "fallback" }> {
  const key = `${day}:${tier}`;
  const stored = await db.select({
    words: dailyOnFireWordsTable.words,
    source: dailyOnFireWordsTable.source,
    lastAttemptAt: dailyOnFireWordsTable.last_attempt_at,
  }).from(dailyOnFireWordsTable)
    .where(and(eq(dailyOnFireWordsTable.utc_date, day), eq(dailyOnFireWordsTable.tier, tier))).limit(1);
  if (stored[0]?.source === "model" && stored[0].words.length === 3) {
    return { words: stored[0].words, source: "model" };
  }
  if (
    stored[0]?.source === "fallback" &&
    stored[0].words.length === 3 &&
    Date.now() - stored[0].lastAttemptAt.getTime() < FALLBACK_RETRY_MS
  ) {
    return { words: stored[0].words, source: "fallback" };
  }
  const existing = onFireInFlight.get(key);
  if (existing) return await existing;
  const generation = (async () => {
    try {
      const generated = parseOnFireWords((await generateOnFireWordsWithClaude(topics, tier)).text);
      if (generated.length === 3) {
        await db.insert(dailyOnFireWordsTable).values({ utc_date: day, tier, words: generated, source: "model", last_attempt_at: new Date() })
          .onConflictDoUpdate({ target: [dailyOnFireWordsTable.utc_date, dailyOnFireWordsTable.tier], set: { words: generated, source: "model", last_attempt_at: new Date() } });
        return { words: generated, source: "model" as const };
      }
      throw new Error(`model returned ${generated.length} valid words`);
    } catch (error) {
      log.warn({ error, tier, day }, "On-fire word generation failed; using fallback");
    }
    const fallback = onFireWordsForDate(day, tier);
    await db.insert(dailyOnFireWordsTable).values({ utc_date: day, tier, words: fallback, source: "fallback", last_attempt_at: new Date() })
      .onConflictDoUpdate({ target: [dailyOnFireWordsTable.utc_date, dailyOnFireWordsTable.tier], set: { words: fallback, source: "fallback", last_attempt_at: new Date() } });
    return { words: fallback, source: "fallback" as const };
  })();
  onFireInFlight.set(key, generation);
  try {
    return await generation;
  } finally {
    onFireInFlight.delete(key);
  }
}

function clampScore(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : 0;
}

function verseCounts(verse: string): { wordCount: number; lineCount: number } {
  return {
    wordCount: verse.trim().split(/\s+/).filter(Boolean).length,
    lineCount: verse.split("\n").filter((line) => line.trim().length > 0).length,
  };
}

function readBattleId(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const battleId = Number(value);
  return Number.isInteger(battleId) && battleId > 0 ? battleId : null;
}

function normalizeBattleClass(value: unknown): BattleClass {
  switch (value) {
    case "lyrical_assassin":
    case "assassin":
      return "lyrical_assassin";
    case "flow_rider":
    case "rider":
      return "flow_rider";
    case "trickster":
      return "trickster";
    case "metamorpher":
      return "metamorpher";
    default:
      return "lyrical_assassin";
  }
}

function serializeBattle(
  row: typeof botBattleSessionsTable.$inferSelect,
  result: BattleScoreResult | null = null,
) {
  return {
    id: row.id,
    topicalWord: row.topical_word,
    topic: row.topic,
     topics: row.topic_choices?.length ? row.topic_choices : (row.topic ? [row.topic] : []),
    onFireWords: row.on_fire_words ?? [],
    rerollsLeft: Math.max(0, 1 - (row.rerolls_used ?? 0)),
    tier: row.tier,
    botName: row.bot_name,
    playerVerse: row.player_verse,
    botResponse: row.bot_response,
    status: row.status,
    createdAt: row.created_at,
    endedAt: row.ended_at,
    result: result
      ? {
           winner: (row.winner as BattleScoreResult["winner"]) ?? result.winner,
           playerFinalScore: row.player_final_score ?? undefined,
           opponentFinalScore: row.opponent_final_score ?? undefined,
            playerMultiplier: row.player_multiplier ?? 1,
           playerRelativeScore: row.player_relative_score ?? Math.round(result.player_relative_score),
           opponentRelativeScore: row.opponent_relative_score ?? Math.round(result.opponent_relative_score),
          playerDimensionScores: {
            rhymeScore: result.player_dimension_scores.rhyme_score,
            flowScore: result.player_dimension_scores.flow_score,
            wordplayScore: result.player_dimension_scores.wordplay_score,
            originalityScore: result.player_dimension_scores.originality_score,
            storytellingScore: result.player_dimension_scores.storytelling_score,
            humorScore: result.player_dimension_scores.humor_score,
          },
          opponentDimensionScores: {
            rhymeScore: result.opponent_dimension_scores.rhyme_score,
            flowScore: result.opponent_dimension_scores.flow_score,
            wordplayScore: result.opponent_dimension_scores.wordplay_score,
            originalityScore: result.opponent_dimension_scores.originality_score,
            storytellingScore: result.opponent_dimension_scores.storytelling_score,
            humorScore: result.opponent_dimension_scores.humor_score,
          },
          playerLineBreakdown: result.player_line_breakdown.map((line) => ({
            lineNumber: line.line_number,
            lineScore: line.line_score,
            techniques: line.techniques,
            isCritical: line.is_critical,
          })),
          opponentLineBreakdown: result.opponent_line_breakdown.map((line) => ({
            lineNumber: line.line_number,
            lineScore: line.line_score,
            techniques: line.techniques,
            isCritical: line.is_critical,
          })),
          verdict: result.verdict,
        }
      : null,
  };
}

router.post("/bot-battles", async (req, res): Promise<void> => {
  const requestedTier = req.body?.tier;
  const storyStep = req.body?.storyStep;
  const requestedPlayerClass = req.body?.playerClass;
  if (
    requestedPlayerClass !== undefined &&
    typeof requestedPlayerClass !== "string"
  ) {
    res.status(400).json({ error: "Invalid player class." });
    return;
  }
  if (
    requestedPlayerClass !== undefined &&
    !["assassin", "lyrical_assassin", "rider", "flow_rider", "trickster"].includes(requestedPlayerClass)
  ) {
    res.status(400).json({ error: "Invalid player class." });
    return;
  }
  const storyConfig = typeof storyStep === "string"
    ? STORY_BATTLE_CONFIG[storyStep as keyof typeof STORY_BATTLE_CONFIG]
    : undefined;
  if (storyStep !== undefined && (!storyConfig || typeof storyStep !== "string")) {
    res.status(400).json({ error: "storyStep must be battle_1, battle_2, or boss_battle." });
    return;
  }
  if (
    requestedTier !== undefined &&
    (typeof requestedTier !== "string" || !VALID_TIERS.has(requestedTier as BattleTier))
  ) {
    res.status(400).json({ error: "tier must be bronze, silver, gold, or master." });
    return;
  }
  if (storyConfig && requestedTier !== undefined && requestedTier !== storyConfig.tier) {
    res.status(400).json({ error: "The requested tier does not match this story battle." });
    return;
  }
  const tier = (storyConfig?.tier ?? requestedTier ?? "bronze") as BattleTier;
  let profileClass: string | null;
  try {
    profileClass = await getUserClass(req.user!.id);
  } catch (error) {
    req.log.error({ error, userId: req.user!.id }, "Unable to load the player's saved class");
    res.status(503).json({ error: "Could not load your class. Please try again." });
    return;
  }
  const serverPlayerClass = normalizeBattleClass(profileClass);
  if (
    requestedPlayerClass !== undefined &&
    ["rider", "flow_rider", "trickster"].includes(requestedPlayerClass) &&
    normalizeBattleClass(requestedPlayerClass) !== serverPlayerClass
  ) {
    res.status(400).json({ error: "Flow Rider and Trickster are coming in a future update." });
    return;
  }


  if (storyStep && storyConfig) {
    const [progress] = await db.select().from(storyProgressTable)
      .where(eq(storyProgressTable.user_id, req.user!.id));
    if (!progress || progress.step !== storyStep) {
      res.status(409).json({ error: "Your story has moved on. Refresh your chapter to continue." });
      return;
    }
    if (progress.active_battle_id) {
      const [activeBattle] = await db.select({ status: botBattleSessionsTable.status })
        .from(botBattleSessionsTable)
        .where(and(
          eq(botBattleSessionsTable.id, progress.active_battle_id),
          eq(botBattleSessionsTable.user_id, req.user!.id),
        ));
      if (activeBattle?.status === "completed") {
        res.status(409).json({ error: "Continue your completed story battle before starting another." });
        return;
      }
    }
  }
  const topicalWords = await db
    .select({ word: topicalWordsTable.word })
    .from(topicalWordsTable)
    .where(eq(topicalWordsTable.active, true));

  if (topicalWords.length === 0) {
    req.log.error("Unable to start bot battle: no active topical words");
    res.status(503).json({ error: "No topical words are available for battle right now." });
    return;
  }

  const day = utcDate();
  const topics = dailyTopics(day);
  const offeredTopics = battleTopicPairForDate(day, `${req.user!.id}:${Date.now()}`);
  const requestedTopic = storyStep === "battle_2"
    ? offeredTopics[0]!
    : typeof req.body?.topic === "string" && offeredTopics.includes(req.body.topic)
    ? req.body.topic
    : offeredTopics[0]!;
  const topicalWord = requestedTopic.split(/\s+/)[0] ?? topicalWords[0]!.word;
  const onFire = await dailyOnFireWords(day, tier, topics, req.log);
  const botName = storyConfig?.botName ?? "Beef";
  const [battle] = await db
    .insert(botBattleSessionsTable)
    .values({
      user_id: req.user!.id,
      topical_word: topicalWord,
      topic: requestedTopic,
      topic_choices: offeredTopics,
      on_fire_words: onFire.words,
      player_class: serverPlayerClass,
      rerolls_used: 0,
      tier,
      bot_name: botName,
      status: "started",
      season_id: "S0",
    })
    .returning();

  if (storyStep && battle) {
    const [updatedProgress] = await db.update(storyProgressTable)
      .set({
        active_battle_id: battle.id,
        last_battle_outcome: null,
        boss_weakest_axis: null,
        updated_at: new Date(),
      })
      .where(and(
        eq(storyProgressTable.user_id, req.user!.id),
        eq(storyProgressTable.step, storyStep),
      ))
      .returning();
    if (!updatedProgress) {
      await db.delete(botBattleSessionsTable).where(and(
        eq(botBattleSessionsTable.id, battle.id),
        eq(botBattleSessionsTable.user_id, req.user!.id),
      ));
      res.status(409).json({ error: "Your story has moved on. Refresh your chapter to continue." });
      return;
    }
  }

  req.log.info({ battleId: battle!.id, tier }, "Started bot battle");
  res.status(201).json({ ...serializeBattle(battle!), topics: offeredTopics, rerollsLeft: 1, onFireWords: onFire.words, onFireSource: onFire.source });
});

router.post("/bot-battles/:battleId/reroll", async (req, res): Promise<void> => {
  const battleId = readBattleId(req.params.battleId);
  if (!battleId) { res.status(400).json({ error: "Invalid battle ID." }); return; }
  const [battle] = await db.select().from(botBattleSessionsTable)
    .where(and(eq(botBattleSessionsTable.id, battleId), eq(botBattleSessionsTable.user_id, req.user!.id)));
  if (!battle || battle.status !== "started" || (battle.rerolls_used ?? 0) >= 1) {
    res.status(400).json({ error: "This battle has no re-rolls left." }); return;
  }
  const topics = rerollTopics(utcDate(), battle.rerolls_used ?? 0, battle.topic_choices ?? []) ?? [];
  const [updated] = await db.update(botBattleSessionsTable).set({
    topic: topics[0] ?? battle.topic,
    topic_choices: topics,
    topical_word: (topics[0] ?? battle.topic ?? "bars").split(/\s+/)[0],
    rerolls_used: 1,
  }).where(and(eq(botBattleSessionsTable.id, battleId), eq(botBattleSessionsTable.user_id, req.user!.id), eq(botBattleSessionsTable.status, "started"))).returning();
  if (!updated) { res.status(409).json({ error: "This battle is no longer available." }); return; }
  res.json({ ...serializeBattle(updated), topics, rerollsLeft: 0 });
});

router.put("/bot-battles/:battleId/topic", async (req, res): Promise<void> => {
  const battleId = readBattleId(req.params.battleId);
  const topic = req.body?.topic;
  if (!battleId || typeof topic !== "string") { res.status(400).json({ error: "A valid topic is required." }); return; }
  if (!dailyTopics(utcDate()).includes(topic)) { res.status(400).json({ error: "That topic is not active today." }); return; }
  const [updated] = await db.update(botBattleSessionsTable).set({
    topic,
    topical_word: topic.split(/\s+/)[0] ?? "bars",
  }).where(and(eq(botBattleSessionsTable.id, battleId), eq(botBattleSessionsTable.user_id, req.user!.id), eq(botBattleSessionsTable.status, "started"))).returning();
  if (!updated) { res.status(409).json({ error: "This battle is no longer available." }); return; }
  res.json(serializeBattle(updated));
});

router.put("/bot-battles/:battleId/verse", async (req, res): Promise<void> => {
  const battleId = readBattleId(req.params.battleId);
  const verse = req.body?.verse;

  if (!battleId || typeof verse !== "string" || verse.trim().length === 0 || verse.length > 5000) {
    res.status(400).json({ error: "A non-empty verse of at most 5000 characters is required." });
    return;
  }

  const [battle] = await db
    .select()
    .from(botBattleSessionsTable)
    .where(and(eq(botBattleSessionsTable.id, battleId), eq(botBattleSessionsTable.user_id, req.user!.id)));

  if (!battle) {
    res.status(404).json({ error: "Battle not found." });
    return;
  }

  if (battle.status !== "started") {
    res.status(400).json({ error: "This battle has already received a verse." });
    return;
  }

  try {
    const quota = await incrementAiUsage(req.user!.id, req.user!.isAnonymous);
    if (!quota.allowed) {
      res.status(429).json({
        error: req.user!.isAnonymous
          ? quota.reason === "global"
            ? GUEST_GLOBAL_LIMIT_MESSAGE
            : GUEST_DAILY_LIMIT_MESSAGE
          : "Daily limit reached. Try again tomorrow.",
      });
      return;
    }
  } catch (error) {
    req.log.error({ error, userId: req.user?.id }, "Unable to update AI usage quota");
    res.status(503).json({ error: "AI usage service unavailable. Please try again." });
    return;
  }

  let botResponse: string;
  let opponentCostUsd = 0;
  try {
    const generated = await generateOpponentVerseWithClaude(
      battle.topic ?? battle.topical_word,
      "bars",
      battle.tier as BattleTier,
      battle.bot_name,
    );
    botResponse = generated.text;
    opponentCostUsd = generated.costUsd;
  } catch (error) {
    req.log.error({ error, battleId }, "Unable to generate opponent verse");
    res.status(503).json({ error: "Opponent service unavailable. Please try again." });
    return;
  }
  const [updatedBattle] = await db
    .update(botBattleSessionsTable)
    .set({
      player_verse: verse.trim(),
      bot_response: botResponse,
      status: "verse_submitted",
      ai_cost_usd: opponentCostUsd,
    })
    .where(
      and(
        eq(botBattleSessionsTable.id, battleId),
        eq(botBattleSessionsTable.user_id, req.user!.id),
        eq(botBattleSessionsTable.status, "started"),
      ),
    )
    .returning();

  if (!updatedBattle) {
    res.status(400).json({ error: "This battle is no longer available for a verse." });
    return;
  }

  req.log.info({ battleId, tier: battle.tier, botName: battle.bot_name }, "Recorded player verse and opponent response");
  res.json(serializeBattle(updatedBattle));
});

router.post("/bot-battles/:battleId/end", async (req, res): Promise<void> => {
  const battleId = readBattleId(req.params.battleId);
  if (!battleId) {
    res.status(400).json({ error: "Invalid battle ID." });
    return;
  }

  const [battle] = await db
    .select()
    .from(botBattleSessionsTable)
    .where(and(eq(botBattleSessionsTable.id, battleId), eq(botBattleSessionsTable.user_id, req.user!.id)));

  if (!battle) {
    res.status(404).json({ error: "Battle not found." });
    return;
  }

  if (battle.status === "completed") {
    res.json(serializeBattle(battle));
    return;
  }

  if (battle.status !== "verse_submitted" || !battle.player_verse || !battle.bot_response) {
    res.status(400).json({ error: "Submit both verses before ending this battle." });
    return;
  }

  try {
    const quota = await incrementAiUsage(req.user!.id, req.user!.isAnonymous);
    if (!quota.allowed) {
      res.status(429).json({
        error: req.user!.isAnonymous
          ? quota.reason === "global"
            ? GUEST_GLOBAL_LIMIT_MESSAGE
            : GUEST_DAILY_LIMIT_MESSAGE
          : "Daily limit reached. Try again tomorrow.",
      });
      return;
    }
  } catch (error) {
    req.log.error({ error, userId: req.user?.id }, "Unable to update AI usage quota");
    res.status(503).json({ error: "AI usage service unavailable. Please try again." });
    return;
  }

  let result: BattleScoreResult;
  let judgeCostUsd = 0;
  let rawPlayerLineBreakdown: BattleScoreResult["player_line_breakdown"] = [];
  let rawOpponentLineBreakdown: BattleScoreResult["opponent_line_breakdown"] = [];
  let onFireWords: string[] = [];
  let playerLinesForScore: string[] = [];
  let botLinesForScore: string[] = [];
  try {
    const judged = await judgeBattleWithClaude(battle.player_verse, battle.bot_response);
    result = judged.result;
    const playerLines = battle.player_verse.split("\n").filter((line) => line.trim());
    const botLines = battle.bot_response.split("\n").filter((line) => line.trim());
    onFireWords = battle.on_fire_words ?? [];
    playerLinesForScore = battle.player_verse.split("\n").filter((line) => line.trim());
    botLinesForScore = battle.bot_response.split("\n").filter((line) => line.trim());
    rawPlayerLineBreakdown = result.player_line_breakdown;
    rawOpponentLineBreakdown = result.opponent_line_breakdown;
    result.player_line_breakdown = result.player_line_breakdown.map((line) => {
      const scored = applyOnFireMultiplier(line.line_score, playerLines[line.line_number - 1] ?? "", onFireWords);
      return scored.onFire ? { ...line, line_score: scored.score, techniques: [...line.techniques, "🔥"] } : line;
    });
    result.opponent_line_breakdown = result.opponent_line_breakdown.map((line) => {
      const scored = applyOnFireMultiplier(line.line_score, botLines[line.line_number - 1] ?? "", onFireWords);
      return scored.onFire ? { ...line, line_score: scored.score, techniques: [...line.techniques, "🔥"] } : line;
    });
    judgeCostUsd = judged.costUsd;
  } catch (error) {
    req.log.error({ error, battleId }, "Unable to judge completed battle");
    res.status(503).json({ error: "Battle judge unavailable. Please try again." });
    return;
  }

  const playerClass = normalizeBattleClass(battle.player_class);
  // There are no active class-skill bonuses yet. Keep the multiplier derived
  // from the server-owned bonus list so both scoring and persistence use the
  // exact value applied to the player's mapped score axis.
  const playerMultiplier = calculateClassAxisMultiplier([]);
  const playerFinalScore = calculateBattleFinalScore(
      result.player_dimension_scores,
      rawPlayerLineBreakdown.map((line) => ({
        line_score: line.line_score,
        matchesOnFire: onFireWords.some((word) => onFireWordMatches(playerLinesForScore[line.line_number - 1] ?? "", word)),
      })),
      playerMultiplier,
      playerClass,
    );
  const opponentFinalScore = calculateBattleFinalScore(
      result.opponent_dimension_scores,
      rawOpponentLineBreakdown.map((line) => ({
        line_score: line.line_score,
        matchesOnFire: onFireWords.some((word) => onFireWordMatches(botLinesForScore[line.line_number - 1] ?? "", word)),
      })),
    );
  const winner = determineBattleWinner(playerFinalScore, opponentFinalScore);
  const playerWeakestAxis = [
    { axis: "rhyme", score: result.player_dimension_scores.rhyme_score },
    { axis: "flow", score: result.player_dimension_scores.flow_score },
    { axis: "wordplay", score: result.player_dimension_scores.wordplay_score },
    { axis: "originality", score: result.player_dimension_scores.originality_score },
    { axis: "storytelling", score: result.player_dimension_scores.storytelling_score },
  ].reduce((weakest, current) => current.score < weakest.score ? current : weakest).axis;
  const playerScore = Math.round(playerFinalScore / 10);
  const opponentScore = Math.round(opponentFinalScore / 10);
  const counts = verseCounts(battle.player_verse);

  const [completedBattle] = await db
    .update(botBattleSessionsTable)
    .set({
      status: "completed",
      ended_at: new Date(),
      ai_cost_usd: (battle.ai_cost_usd ?? 0) + judgeCostUsd,
      player_relative_score: playerScore,
      opponent_relative_score: opponentScore,
      player_final_score: playerFinalScore,
      opponent_final_score: opponentFinalScore,
      player_multiplier: playerMultiplier,
      player_weakest_axis: playerWeakestAxis,
      winner,
    })
    .where(and(eq(botBattleSessionsTable.id, battleId), eq(botBattleSessionsTable.user_id, req.user!.id)))
    .returning();

  if (!completedBattle) {
    req.log.error({ battleId }, "Unable to complete judged bot battle");
    res.status(409).json({ error: "This battle is no longer available." });
    return;
  }

  if (!req.user!.isAnonymous) {
    try {
      await recordScoredSession({
        p_user: req.user!.id,
        p_mode: "battle",
        p_final_score: playerFinalScore,
        p_rhyme: clampScore(result.player_dimension_scores.rhyme_score),
        p_flow: clampScore(result.player_dimension_scores.flow_score),
        p_wordplay: clampScore(result.player_dimension_scores.wordplay_score),
        p_originality: clampScore(result.player_dimension_scores.originality_score),
        p_storytelling: clampScore(result.player_dimension_scores.storytelling_score),
        p_humor: clampScore(result.player_dimension_scores.humor_score),
        p_multiplier: playerMultiplier,
        p_best_line: "",
        p_coach_note: result.verdict,
        p_weakness: "",
        p_word_count: counts.wordCount,
        p_line_count: counts.lineCount,
        p_season_id: "S0",
        p_topic: battle.topic ?? `${battle.topical_word} + bars`,
        p_tier: battle.tier,
      });
    } catch (error) {
      req.log.error({ error, battleId, userId: req.user?.id }, "Unable to record bot battle session");
    }

    try {
      await insertBattleResult({
        user_id: req.user!.id,
        opponent_type: "bot",
        opponent_difficulty: battle.tier,
        player_score: playerScore,
        opponent_score: opponentScore,
         winner,
        verdict: result.verdict,
        word1: battle.topical_word,
      });
    } catch (error) {
      req.log.error({ error, battleId, userId: req.user?.id }, "Unable to record bot battle result");
    }
  }

  req.log.info({ battleId, winner }, "Completed judged bot battle");
  res.json(serializeBattle(completedBattle, { ...result, winner }));
});

export default router;