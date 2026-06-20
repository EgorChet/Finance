import { Router } from "express";
import {
  authEnabled,
  bearerToken,
  checkPassword,
  createToken,
  requireAuth,
  verifyTokenDetails,
} from "../auth.js";
import { listAuthUsers, parseUsername, parseUserId, userProfile, loginNameHint } from "../users.js";

const router = Router();

router.get("/status", (_req, res) => {
  res.json({
    auth_required: authEnabled(),
    users: listAuthUsers(),
  });
});

router.post("/login", (req, res) => {
  const { password, user, username } = req.body as { password?: string; user?: string; username?: string };
  const userId = parseUsername(username ?? "") ?? parseUserId(user) ?? null;
  if (!userId) {
    res.status(401).json({ error: `Unknown name — use ${loginNameHint()}` });
    return;
  }
  if (!authEnabled()) {
    const profile = userProfile(userId);
    res.json({ token: createToken(userId), auth_required: false, user: userId, label: profile.label, features: profile.features });
    return;
  }
  if (!password || !checkPassword(password, userId)) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  const profile = userProfile(userId);
  res.json({
    token: createToken(userId),
    auth_required: true,
    user: userId,
    label: profile.label,
    features: profile.features,
  });
});

router.get("/me", requireAuth, (req, res) => {
  const details = verifyTokenDetails(bearerToken(req));
  const profile = userProfile(details.userId);
  res.json({ user: profile.id, label: profile.label, features: profile.features });
});

export default router;
