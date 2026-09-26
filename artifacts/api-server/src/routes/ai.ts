import { Router, type IRouter } from "express";
import {
  parseLyricsScore,
  scoreLyricsWithClaude,
  type QuickStats,
} from "../lib/ai";
import {
  GUEST_DAILY_LIMIT_MESSAGE,
  GUEST_GLOBAL_LIMIT_MESSAGE,
  incrementAiUsage,
} from "../lib/ai-usage";
import { recordScoredSession, updateInstallId } from "../lib/supabase-admin";

const router: IRouter = Router();
const VALID_SCORE_MODES = ["free", "prompted", "blitz", "drill"] as const;
type ScoreMode = (typeof VALID_SCORE_MODES)[number];

function isScoreMode(value: unknown): value is ScoreMode {
  return typeof value === "string" && VALID_SCORE_MODES.includes(value as ScoreMode);
}

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
  const { lyrics, quickStats, mode, prompt, installId } = req.body ?? {};
  if (
    typeof lyrics !== "string" ||
    lyrics.trim().length === 0 ||
    lyrics.length > 5000 ||
    !isQuickStats(quickStats) ||
    !isScoreMode(mode)
  ) {
    res.status(400).json({ error: "Lyrics, computed quick stats, and a valid mode are required." });
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
  try {
    const scored = await scoreLyricsWithClaude(lyrics, quickStats);
    const text = scored.text;
    const parsed = parseLyricsScore(text, quickStats);
    const verifiedLineCount = lyrics.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
    const verifiedWordCount = lyrics.trim().split(/\s+/).filter(Boolean).length;

    if (!req.user!.isAnonymous) {
      try {
        await recordScoredSession({
          p_user: req.user!.id,
          p_mode: mode,
          p_final_score: parsed.finalScore,
          p_rhyme: parsed.scores.rhyme_score,
          p_flow: quickStats.flowScore === null ? 0 : parsed.scores.flow_score,
          p_wordplay: parsed.scores.wordplay_score,
          p_originality: parsed.scores.originality_score,
           p_storytelling: parsed.scores.storytelling_score,
           p_humor: parsed.scores.humor_score,
          p_multiplier: parsed.multiplier,
          p_best_line: parsed.standoutLine,
          p_coach_note: parsed.coachNote,
          p_weakness: parsed.weaknessOptions[0]?.dimension ?? "",
          p_word_count: verifiedWordCount,
          p_line_count: verifiedLineCount,
           p_season_id: "S0",
           p_topic: mode === "prompted" && typeof prompt === "string" ? prompt : undefined,
        });
      } catch (error) {
        req.log.error({ error, userId: req.user?.id, mode }, "Unable to record scored session");
      }
    }

    if (!req.user!.isAnonymous && typeof installId === "string" && installId.length > 0) {
      updateInstallId(req.user!.id, installId).catch((error) => {
        req.log.warn({ error, userId: req.user?.id }, "Unable to store install id");
      });
    }

    res.json({
      text,
      finalScore: parsed.finalScore,
      scores: parsed.scores,
      multiplier: parsed.multiplier,
    });
  } catch (error) {
    req.log.error({ error }, "Unable to score lyrics");
    res.status(503).json({ error: "Scoring service unavailable. Please try again." });
  }
});

export default router;