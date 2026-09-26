import { Router, type IRouter } from "express";
import { requirePrelaunchAllowlist, isPrelaunchMode } from "../middlewares/prelaunch";
import { requireSupabaseAuth } from "../middlewares/supabase-auth";

const router: IRouter = Router();

router.get("/prelaunch/status", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ enabled: isPrelaunchMode() });
});

router.get(
  "/prelaunch/access",
  requireSupabaseAuth,
  requirePrelaunchAllowlist,
  (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ enabled: isPrelaunchMode(), allowed: true, userId: req.user?.id });
  },
);

export default router;