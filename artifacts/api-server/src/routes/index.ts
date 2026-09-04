import { Router, type IRouter } from "express";
import botBattlesRouter from "./bot-battles";
import devRouter from "./dev";
import healthRouter from "./health";
import lyricsRouter from "./lyrics";
import aiRouter from "./ai";
import { requireSupabaseAuth } from "../middlewares/supabase-auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(lyricsRouter);
router.use(requireSupabaseAuth, aiRouter);
router.use(requireSupabaseAuth, botBattlesRouter);

if (process.env.NODE_ENV !== "production") {
  router.use(requireSupabaseAuth, devRouter);
}

export default router;
