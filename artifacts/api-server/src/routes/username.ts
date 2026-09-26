import { Router, type IRouter } from "express";
import { validateUsername } from "../lib/content-policy";

const router: IRouter = Router();

router.post("/username/validate", (req, res) => {
  const username = req.body?.username;
  if (typeof username !== "string") {
    res.status(400).json({ valid: false, error: "Username is required." });
    return;
  }
  const error = validateUsername(username);
  if (error) {
    res.status(400).json({ valid: false, error });
    return;
  }
  res.json({ valid: true });
});

export default router;