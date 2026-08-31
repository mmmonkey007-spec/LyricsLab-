import { Router, type IRouter } from "express";
import {
  generateOpponentVerseWithClaude,
  judgeBattleWithClaude,
  scoreLyricsWithClaude,
  type BattleTier,
  type QuickStats,
} from "../lib/ai";

const router: IRouter = Router();
const VALID_TIERS = new Set<BattleTier>(["bronze", "silver", "gold", "master"]);

function isQuickStats(value: unknown): value is QuickStats {
  if (!value || typeof value !== "object") return false;
  const stats = value as Record<string, unknown>;
  return (
    typeof stats.wordCount === "number" &&
    typeof stats.lineCount === "number" &&
    typeof stats.rhymePairs === "number" &&
    typeof stats.multiSyllRhymes === "number" &&
    typeof stats.allitCount === "number" &&
    (typeof stats.flowScore === "number" || stats.flowScore === null) &&
    typeof stats.uniqueRatio === "number"
  );
}

router.post("/lyrics/score", async (req, res): Promise<void> => {
  const { lyrics, quickStats } = req.body ?? {};
  if (typeof lyrics !== "string" || lyrics.trim().length === 0 || lyrics.length > 5000 || !isQuickStats(quickStats)) {
    res.status(400).json({ error: "Lyrics and computed quick stats are required." });
    return;
  }
  try {
    res.json({ text: await scoreLyricsWithClaude(lyrics, quickStats) });
  } catch (error) {
    req.log.error({ error }, "Unable to score lyrics");
    res.status(503).json({ error: error instanceof Error ? error.message : "Scoring service unavailable." });
  }
});

router.post("/lyrics/opponent", async (req, res): Promise<void> => {
  const { word1, word2, difficulty = "bronze" } = req.body ?? {};
  if (
    typeof word1 !== "string" ||
    typeof word2 !== "string" ||
    word1.trim().length === 0 ||
    word2.trim().length === 0 ||
    !VALID_TIERS.has(difficulty)
  ) {
    res.status(400).json({ error: "Two words and a valid battle tier are required." });
    return;
  }
  try {
    res.json({ verse: await generateOpponentVerseWithClaude(word1, word2, difficulty) });
  } catch (error) {
    req.log.error({ error }, "Unable to generate opponent verse");
    res.status(503).json({ error: error instanceof Error ? error.message : "Opponent service unavailable." });
  }
});

router.post("/lyrics/battle-score", async (req, res): Promise<void> => {
  const { playerLyrics, opponentLyrics } = req.body ?? {};
  if (
    typeof playerLyrics !== "string" ||
    typeof opponentLyrics !== "string" ||
    playerLyrics.trim().length === 0 ||
    opponentLyrics.trim().length === 0
  ) {
    res.status(400).json({ error: "Both verses are required." });
    return;
  }
  try {
    res.json(await judgeBattleWithClaude(playerLyrics, opponentLyrics));
  } catch (error) {
    req.log.error({ error }, "Unable to judge battle");
    res.status(503).json({ error: error instanceof Error ? error.message : "Battle judge unavailable." });
  }
});

export default router;