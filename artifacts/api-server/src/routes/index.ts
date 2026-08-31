import { Router, type IRouter } from "express";
import botBattlesRouter from "./bot-battles";
import devRouter from "./dev";
import healthRouter from "./health";
import lyricsRouter from "./lyrics";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(lyricsRouter);
router.use(aiRouter);
router.use(botBattlesRouter);
router.use(devRouter);

export default router;
