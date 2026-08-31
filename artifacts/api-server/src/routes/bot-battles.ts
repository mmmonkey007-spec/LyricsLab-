import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, botBattleSessionsTable, topicalWordsTable } from "@workspace/db";
import {
  generateOpponentVerseWithClaude,
  judgeBattleWithClaude,
  type BattleScoreResult,
  type BattleTier,
} from "../lib/ai";

const router: IRouter = Router();

const VALID_TIERS = new Set<BattleTier>(["bronze", "silver", "gold", "master"]);

function readBattleId(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const battleId = Number(value);
  return Number.isInteger(battleId) && battleId > 0 ? battleId : null;
}

function serializeBattle(
  row: typeof botBattleSessionsTable.$inferSelect,
  result: BattleScoreResult | null = null,
) {
  return {
    id: row.id,
    topicalWord: row.topical_word,
    tier: row.tier,
    botName: row.bot_name,
    playerVerse: row.player_verse,
    botResponse: row.bot_response,
    status: row.status,
    createdAt: row.created_at,
    endedAt: row.ended_at,
    result: result
      ? {
          winner: result.winner,
          playerRelativeScore: result.player_relative_score,
          opponentRelativeScore: result.opponent_relative_score,
          playerDimensionScores: {
            rhymeScore: result.player_dimension_scores.rhyme_score,
            flowScore: result.player_dimension_scores.flow_score,
            wordplayScore: result.player_dimension_scores.wordplay_score,
            originalityScore: result.player_dimension_scores.originality_score,
            techniqueScore: result.player_dimension_scores.technique_score,
            humorScore: result.player_dimension_scores.humor_score,
          },
          opponentDimensionScores: {
            rhymeScore: result.opponent_dimension_scores.rhyme_score,
            flowScore: result.opponent_dimension_scores.flow_score,
            wordplayScore: result.opponent_dimension_scores.wordplay_score,
            originalityScore: result.opponent_dimension_scores.originality_score,
            techniqueScore: result.opponent_dimension_scores.technique_score,
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
  const requestedTier = req.body?.tier ?? "bronze";
  if (typeof requestedTier !== "string" || !VALID_TIERS.has(requestedTier as BattleTier)) {
    res.status(400).json({ error: "tier must be bronze, silver, gold, or master." });
    return;
  }
  const tier = requestedTier as BattleTier;
  const topicalWords = await db
    .select({ word: topicalWordsTable.word })
    .from(topicalWordsTable)
    .where(eq(topicalWordsTable.active, true));

  if (topicalWords.length === 0) {
    req.log.error("Unable to start bot battle: no active topical words");
    res.status(503).json({ error: "No topical words are available for battle right now." });
    return;
  }

  const topicalWord = topicalWords[Math.floor(Math.random() * topicalWords.length)]!.word;
  const [battle] = await db
    .insert(botBattleSessionsTable)
    .values({ topical_word: topicalWord, tier, bot_name: "Beef", status: "started" })
    .returning();

  req.log.info({ battleId: battle!.id, tier }, "Started bot battle");
  res.status(201).json(serializeBattle(battle!));
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
    .where(eq(botBattleSessionsTable.id, battleId));

  if (!battle) {
    res.status(404).json({ error: "Battle not found." });
    return;
  }

  if (battle.status !== "started") {
    res.status(400).json({ error: "This battle has already received a verse." });
    return;
  }

  let botResponse: string;
  try {
    botResponse = await generateOpponentVerseWithClaude(battle.topical_word, "bars", battle.tier as BattleTier);
  } catch (error) {
    req.log.error({ error, battleId }, "Unable to generate opponent verse");
    res.status(503).json({ error: error instanceof Error ? error.message : "Opponent service unavailable." });
    return;
  }
  const [updatedBattle] = await db
    .update(botBattleSessionsTable)
    .set({ player_verse: verse.trim(), bot_response: botResponse, status: "verse_submitted" })
    .where(and(eq(botBattleSessionsTable.id, battleId), eq(botBattleSessionsTable.status, "started")))
    .returning();

  if (!updatedBattle) {
    res.status(400).json({ error: "This battle is no longer available for a verse." });
    return;
  }

  req.log.info({ battleId, tier: battle.tier }, "Recorded player verse and Beef response");
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
    .where(eq(botBattleSessionsTable.id, battleId));

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

  let result: Awaited<ReturnType<typeof judgeBattleWithClaude>>;
  try {
    result = await judgeBattleWithClaude(battle.player_verse, battle.bot_response);
  } catch (error) {
    req.log.error({ error, battleId }, "Unable to judge completed battle");
    res.status(503).json({ error: error instanceof Error ? error.message : "Battle judge unavailable." });
    return;
  }

  const [completedBattle] = await db
    .update(botBattleSessionsTable)
    .set({ status: "completed", ended_at: new Date() })
    .where(eq(botBattleSessionsTable.id, battleId))
    .returning();

  req.log.info({ battleId, winner: result.winner }, "Completed judged bot battle");
  res.json(serializeBattle(completedBattle!, result));
});

export default router;