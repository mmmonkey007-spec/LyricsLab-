import { Router, type IRouter } from "express";
import botBattlesRouter from "./bot-battles";
import devRouter from "./dev";
import healthRouter from "./health";
import lyricsRouter from "./lyrics";
import aiRouter from "./ai";
import accountRouter from "./account";
import usernameRouter from "./username";
import performancesRouter from "./performances";
import storyProgressRouter from "./story-progress";
import { requireSupabaseAuth } from "../middlewares/supabase-auth";
import { requirePrelaunchAllowlist } from "../middlewares/prelaunch";
import { PRIVACY_POLICY_HTML } from "../privacy-policy";
import { buildTurnstilePage } from "../turnstile-page";
import prelaunchRouter from "./prelaunch";
import leaderboardRouter from "./leaderboard";
import profileRouter from "./profile";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usernameRouter);
router.use(prelaunchRouter);
router.get("/privacy", (_req, res) => {
  res.type("html").send(PRIVACY_POLICY_HTML);
});
router.get("/turnstile", (_req, res) => {
  const { html, contentSecurityPolicy } = buildTurnstilePage();
  res.set({
    "Content-Security-Policy": contentSecurityPolicy,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  });
  res.type("html").send(html);
});
router.use(requireSupabaseAuth, requirePrelaunchAllowlist, lyricsRouter);
router.use(requireSupabaseAuth, requirePrelaunchAllowlist, accountRouter);
router.use(requireSupabaseAuth, requirePrelaunchAllowlist, aiRouter);
router.use(requireSupabaseAuth, requirePrelaunchAllowlist, leaderboardRouter);
router.use(requireSupabaseAuth, requirePrelaunchAllowlist, profileRouter);
router.use(requireSupabaseAuth, requirePrelaunchAllowlist, botBattlesRouter);
router.use(requireSupabaseAuth, requirePrelaunchAllowlist, storyProgressRouter);
router.use(requireSupabaseAuth, requirePrelaunchAllowlist, performancesRouter);

if (process.env.NODE_ENV !== "production") {
  router.use(requireSupabaseAuth, requirePrelaunchAllowlist, devRouter);
}

export default router;
