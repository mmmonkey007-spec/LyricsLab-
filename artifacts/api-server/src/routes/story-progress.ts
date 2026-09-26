import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";

import { botBattleSessionsTable, db, storyProgressTable } from "@workspace/db";

const router: IRouter = Router();

const STORY_STEPS = new Set([
  "scene_1",
  "battle_1",
  "scene_2",
  "battle_2",
  "scene_3",
  "boss_battle",
  "hook",
]);

const SCENE_NEXT_STEP: Record<string, string> = {
  scene_1: "battle_1",
  scene_2: "battle_2",
  scene_3: "boss_battle",
};

const BATTLE_CONFIG = {
  battle_1: { tier: "bronze", nextStep: "scene_2" },
  battle_2: { tier: "silver", nextStep: "scene_3" },
  boss_battle: { tier: "gold", nextStep: "hook" },
} as const;

type ProgressRow = typeof storyProgressTable.$inferSelect;

async function readProgress(userId: string): Promise<ProgressRow | null> {
  const [progress] = await db.select().from(storyProgressTable)
    .where(eq(storyProgressTable.user_id, userId));
  return progress ?? null;
}

async function responseFor(userId: string, progress: ProgressRow | null) {
  const activeBattleId = progress?.active_battle_id ?? null;
  let activeBattle = null;
  if (activeBattleId) {
    const [battle] = await db.select({
      id: botBattleSessionsTable.id,
      status: botBattleSessionsTable.status,
      tier: botBattleSessionsTable.tier,
      botName: botBattleSessionsTable.bot_name,
      topic: botBattleSessionsTable.topic,
      winner: botBattleSessionsTable.winner,
      playerFinalScore: botBattleSessionsTable.player_final_score,
      opponentFinalScore: botBattleSessionsTable.opponent_final_score,
      weakestAxis: botBattleSessionsTable.player_weakest_axis,
    }).from(botBattleSessionsTable).where(and(
      eq(botBattleSessionsTable.id, activeBattleId),
      eq(botBattleSessionsTable.user_id, userId),
    ));
    activeBattle = battle ?? null;
  }

  return {
    chapter: progress?.chapter ?? 1,
    step: progress?.step ?? "scene_1",
    activeBattle,
    lastBattleOutcome: progress?.last_battle_outcome ?? null,
    bossWeakestAxis: progress?.boss_weakest_axis ?? null,
  };
}

async function saveProgress(
  userId: string,
  values: {
    step: string;
    active_battle_id: number | null;
    last_battle_outcome: string | null;
    boss_weakest_axis: string | null;
  },
): Promise<ProgressRow> {
  const [saved] = await db.insert(storyProgressTable).values({
    user_id: userId,
    chapter: 1,
    ...values,
    updated_at: new Date(),
  }).onConflictDoUpdate({
    target: storyProgressTable.user_id,
    set: { ...values, updated_at: new Date() },
  }).returning();
  if (!saved) throw new Error("Story progress could not be saved.");
  return saved;
}

router.get("/story-progress", async (req, res): Promise<void> => {
  const progress = await readProgress(req.user!.id);
  res.json(await responseFor(req.user!.id, progress));
});

router.post("/story-progress/advance", async (req, res): Promise<void> => {
  const fromStep = req.body?.fromStep;
  if (typeof fromStep !== "string" || !STORY_STEPS.has(fromStep)) {
    res.status(400).json({ error: "A valid Chapter 1 step is required." });
    return;
  }

  const progress = await readProgress(req.user!.id);
  const currentStep = progress?.step ?? "scene_1";
  if (currentStep !== fromStep) {
    res.status(409).json({
      error: "Your story has moved on. Refresh your chapter to continue.",
      ...(await responseFor(req.user!.id, progress)),
    });
    return;
  }

  const sceneNextStep = SCENE_NEXT_STEP[fromStep];
  if (sceneNextStep) {
    const saved = await saveProgress(req.user!.id, {
      step: sceneNextStep,
      active_battle_id: null,
      last_battle_outcome: progress?.last_battle_outcome ?? null,
      boss_weakest_axis: progress?.boss_weakest_axis ?? null,
    });
    res.json(await responseFor(req.user!.id, saved));
    return;
  }

  const battleConfig = BATTLE_CONFIG[fromStep as keyof typeof BATTLE_CONFIG];
  if (!battleConfig) {
    res.status(409).json({ error: "Chapter 2 is not available yet." });
    return;
  }

  const battleId = Number(req.body?.battleId);
  if (!Number.isInteger(battleId) || battleId <= 0 || progress?.active_battle_id !== battleId) {
    res.status(400).json({ error: "A completed story battle is required to continue." });
    return;
  }
  const [battle] = await db.select().from(botBattleSessionsTable).where(and(
    eq(botBattleSessionsTable.id, battleId),
    eq(botBattleSessionsTable.user_id, req.user!.id),
  ));
  if (!battle || battle.status !== "completed" || battle.tier !== battleConfig.tier) {
    res.status(409).json({ error: "That story battle is not complete." });
    return;
  }

  const outcome = battle.winner === "player" ? "win" : battle.winner === "draw" ? "draw" : "loss";
  const isBossWin = fromStep === "boss_battle" && battle.winner === "player";
  const nextStep = fromStep === "boss_battle" && !isBossWin
    ? "boss_battle"
    : battleConfig.nextStep;
  const saved = await saveProgress(req.user!.id, {
    step: nextStep,
    active_battle_id: null,
    last_battle_outcome: outcome,
    boss_weakest_axis: fromStep === "boss_battle" && !isBossWin
      ? battle.player_weakest_axis ?? "flow"
      : null,
  });
  res.json(await responseFor(req.user!.id, saved));
});

export default router;