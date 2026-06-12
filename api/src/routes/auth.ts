import { Router } from "express";
import { authEnabled, checkPassword, createToken } from "../auth.js";

const router = Router();

router.get("/status", (_req, res) => {
  res.json({ auth_required: authEnabled() });
});

router.post("/login", (req, res) => {
  const { password } = req.body as { password?: string };
  if (!authEnabled()) {
    res.json({ token: createToken(), auth_required: false });
    return;
  }
  if (!password || !checkPassword(password)) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  res.json({ token: createToken(), auth_required: true });
});

export default router;
