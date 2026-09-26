import { Router, type IRouter } from "express";
import { validateUsername } from "../lib/content-policy";
import { getPublicLeaderboardRows } from "../lib/supabase-admin";

const router: IRouter = Router();

const RANK_TIERS: Record<string, string> = {
  assassin: "Lyrical Assassin",
  lyrical_assassin: "Lyrical Assassin",
  rider: "Flow Rider",
  flow_rider: "Flow Rider",
  trickster: "Trickster",
};

router.get("/leaderboard", async (req, res): Promise<void> => {
  try {
    const rows = await getPublicLeaderboardRows();
    const entries = rows
      .filter((row) => Number.isFinite(Number(row.best_score)))
      .map((row, index) => ({
        rank: index + 1,
        displayName:
          typeof row.username === "string" && validateUsername(row.username) === null
            ? row.username.trim()
            : "Player",
        rankTier: row.class ? RANK_TIERS[row.class] ?? null : null,
        score: Math.max(0, Math.floor(Number(row.best_score))),
      }));

    res.json({ entries });
  } catch (error) {
    req.log.error({ error }, "Unable to load the global leaderboard");
    res.status(503).json({ error: "Leaderboard service unavailable. Please try again." });
  }
});

export default router;