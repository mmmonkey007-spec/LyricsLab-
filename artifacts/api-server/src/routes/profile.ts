import { Router, type IRouter } from "express";
import { updateUserClass } from "../lib/supabase-admin";

const router: IRouter = Router();

router.patch("/profile/class", async (req, res): Promise<void> => {
  const playerClass = req.body?.class;
  if (playerClass !== "lyrical_assassin") {
    res.status(400).json({ error: "Only Lyrical Assassin is available at launch." });
    return;
  }

  try {
    await updateUserClass(req.user!.id, "lyrical_assassin");
    res.status(204).end();
  } catch (error) {
    req.log.error({ error, userId: req.user!.id }, "Unable to save the player's class");
    res.status(503).json({ error: "Could not save your class. Please try again." });
  }
});

export default router;