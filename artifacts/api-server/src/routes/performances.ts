import { and, count, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, botBattleSessionsTable, lyricPerformancesTable } from "@workspace/db";
import { generatePassingTake, normalizedWords } from "../lib/perform-my-verse";
import { containsBlockedTerm } from "../lib/content-policy";
import { renderPerformanceShareVideo } from "../lib/performance-share-video";

const router: IRouter = Router();

function serverDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseId(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function publicPerformance(row: typeof lyricPerformancesTable.$inferSelect, remaining: number) {
  return {
    id: row.id,
    battleId: row.battle_id,
    verse: row.verse,
    intro: row.intro,
    echoOut: row.echo_out,
    durationMs: row.duration_ms,
    audioSizeBytes: row.audio_size_bytes,
    audioProvenance: row.audio_provenance,
    beatManifest: row.audio_manifest,
    transcript: row.transcript,
    fidelityPassed: row.fidelity_passed,
    createdAt: row.created_at,
    remainingToday: remaining,
    audioBase64: row.audio_data.toString("base64"),
  };
}

router.post("/performances", async (req, res): Promise<void> => {
  const verse = req.body?.verse;
  const intro = req.body?.intro === undefined ? true : req.body.intro;
  const echoOut = req.body?.echoOut === undefined ? true : req.body.echoOut;
  const hasBattleId = req.body?.battleId !== undefined;
  const battleId = hasBattleId ? Number(req.body.battleId) : null;

  if (
    typeof verse !== "string" ||
    verse.trim().length === 0 ||
    verse.length > 5000 ||
    typeof intro !== "boolean" ||
    typeof echoOut !== "boolean"
  ) {
    res.status(400).json({ error: "A non-empty verse, intro toggle, and echo out toggle are required." });
    return;
  }
  if (hasBattleId && (!Number.isInteger(battleId) || (battleId ?? 0) <= 0)) {
    res.status(400).json({ error: "Invalid battle ID." });
    return;
  }

  if (containsBlockedTerm(verse)) {
    res.status(422).json({
      error: "This verse contains content we can’t include in a performance. Please edit it and try again.",
    });
    return;
  }

  let linkedBattle: typeof botBattleSessionsTable.$inferSelect | null = null;
  if (battleId !== null) {
    const [battle] = await db
      .select()
      .from(botBattleSessionsTable)
      .where(and(
        eq(botBattleSessionsTable.id, battleId),
        eq(botBattleSessionsTable.user_id, req.user!.id),
      ));
    if (
      !battle ||
      battle.status !== "completed" ||
      battle.player_relative_score === null ||
      battle.opponent_relative_score === null ||
      (battle.winner !== "player" && battle.winner !== "opponent" && battle.winner !== "draw") ||
      !battle.player_verse ||
      battle.player_verse.replace(/\r\n?/g, "\n").trim() !== verse.replace(/\r\n?/g, "\n").trim()
    ) {
      res.status(409).json({ error: "The completed battle result could not be matched to this verse." });
      return;
    }
    linkedBattle = battle;
  }

  const userId = req.user!.id;
  const day = serverDate();
  try {
    const [{ successful: existingSuccessful }] = await db
      .select({ successful: count() })
      .from(lyricPerformancesTable)
      .where(and(eq(lyricPerformancesTable.user_id, userId), eq(lyricPerformancesTable.performance_date, day)));
    if (Number(existingSuccessful) >= 3) {
      res.status(429).json({ error: "You have used all 3 Perform my verse takes for today. Try again tomorrow.", remainingToday: 0 });
      return;
    }

    const take = await generatePassingTake(
      verse.trim(),
      { intro, echoOut },
      (takeLog) => req.log.info({ take: takeLog }, "Evaluated generated lyric take"),
      {
        maxPairs:
          process.env.NODE_ENV !== "production" &&
          req.get("x-lyriclab-diagnostic-pair-limit") === "1"
            ? 1
            : undefined,
      },
    );
    const expectedWordCount = normalizedWords(verse).length;
    const created = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId + day}, 0))`);
      const [{ successful }] = await tx
        .select({ successful: count() })
        .from(lyricPerformancesTable)
        .where(and(eq(lyricPerformancesTable.user_id, userId), eq(lyricPerformancesTable.performance_date, day)));
      if (Number(successful) >= 3) return null;

      const [row] = await tx
        .insert(lyricPerformancesTable)
        .values({
          user_id: userId,
          battle_id: linkedBattle?.id ?? null,
          performance_date: day,
          verse: verse.trim(),
          intro,
          echo_out: echoOut,
          audio_data: take.audio,
          audio_content_type: "audio/mpeg",
          audio_provenance: take.audioProvenance,
          audio_manifest: take.beatManifest,
          audio_size_bytes: take.audio.length,
          duration_ms: take.durationMs,
          generation_cost_usd: take.generationCostUsd,
          transcription_cost_usd: take.transcriptionCostUsd,
          fidelity_passed: true,
          transcript: take.transcript,
          expected_word_count: expectedWordCount,
          delivered_word_count: take.wordTexts.length,
        })
        .returning();
      return row ?? null;
    });

    if (!created) {
      res.status(429).json({ error: "You have used all 3 Perform my verse takes for today. Try again tomorrow.", remainingToday: 0 });
      return;
    }

    const remainingToday = Math.max(0, 3 - Number(
      (await db
        .select({ successful: count() })
        .from(lyricPerformancesTable)
        .where(and(eq(lyricPerformancesTable.user_id, userId), eq(lyricPerformancesTable.performance_date, day))))[0]?.successful ?? 0,
    ));
    req.log.info(
      { performanceId: created.id, userId, durationMs: created.duration_ms, audioSizeBytes: created.audio_size_bytes, fidelityPassed: created.fidelity_passed },
      "Stored passing lyric performance",
    );
    res.status(201).json(publicPerformance(created, remainingToday));
  } catch (error) {
    req.log.error(
      { errorMessage: error instanceof Error ? error.message : String(error), userId },
      "Unable to generate an exact lyric performance",
    );
    res.status(503).json({ error: "We could not make an exact take of your verse. Your daily take was not used. Please try again." });
  }
});

router.get("/performances/:performanceId/share-video/:option", async (req, res): Promise<void> => {
  const performanceId = parseId(req.params.performanceId);
  const option = req.params.option;
  if (!performanceId || (option !== "rap" && option !== "score")) {
    res.status(400).json({ error: "Invalid performance ID or share option." });
    return;
  }

  const [performance] = await db
    .select()
    .from(lyricPerformancesTable)
    .where(and(
      eq(lyricPerformancesTable.id, performanceId),
      eq(lyricPerformancesTable.user_id, req.user!.id),
    ));
  if (!performance) {
    res.status(404).json({ error: "Performance not found." });
    return;
  }

  let score: { finalScore: number; winner: "player" | "opponent" | "draw"; tier: string } | undefined;
  if (option === "score") {
    if (performance.battle_id === null) {
      res.status(409).json({ error: "No completed battle result is linked to this performance." });
      return;
    }
    const [battle] = await db
      .select()
      .from(botBattleSessionsTable)
      .where(and(
        eq(botBattleSessionsTable.id, performance.battle_id),
        eq(botBattleSessionsTable.user_id, req.user!.id),
      ));
    if (
      !battle ||
      battle.status !== "completed" ||
      battle.player_relative_score === null ||
      battle.opponent_relative_score === null ||
      (battle.winner !== "player" && battle.winner !== "opponent" && battle.winner !== "draw")
    ) {
      res.status(409).json({ error: "No completed battle result is linked to this performance." });
      return;
    }
    score = {
      finalScore: battle.player_final_score ?? battle.player_relative_score,
      winner: battle.winner,
      tier: battle.tier,
    };
  }

  try {
    const video = await renderPerformanceShareVideo({
      performanceId: performance.id,
      verse: performance.verse,
      audio: performance.audio_data,
      durationMs: performance.duration_ms,
      intro: performance.intro,
      echoOut: performance.echo_out,
      score,
    });
    res.set({
      "Content-Type": "video/mp4",
      "Content-Length": String(video.length),
      "Content-Disposition": `attachment; filename="lyriclab-${performance.id}-${option}.mp4"`,
      "Cache-Control": "private, max-age=86400",
    });
    res.send(video);
  } catch (error) {
    req.log.error(
      { errorMessage: error instanceof Error ? error.message : String(error), performanceId },
      "Unable to render lyric performance share video",
    );
    res.status(503).json({ error: "We could not prepare the video right now. Please try again." });
  }
});

router.get("/performances/:performanceId/audio", async (req, res): Promise<void> => {
  const performanceId = parseId(req.params.performanceId);
  if (!performanceId) {
    res.status(400).json({ error: "Invalid performance ID." });
    return;
  }
  const [row] = await db
    .select()
    .from(lyricPerformancesTable)
    .where(and(eq(lyricPerformancesTable.id, performanceId), eq(lyricPerformancesTable.user_id, req.user!.id)));
  if (!row) {
    res.status(404).json({ error: "Performance not found." });
    return;
  }
  res.set({
    "Content-Type": row.audio_content_type,
    "Content-Length": String(row.audio_size_bytes),
    "Cache-Control": "private, max-age=3600",
  });
  res.send(row.audio_data);
});

export default router;