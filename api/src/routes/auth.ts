import { Router } from "express";
import {
  authEnabled,
  bearerToken,
  checkPassword,
  createToken,
  requireAuth,
  verifyTokenDetails,
} from "../auth.js";
import { listAuthUsers, loginLabelsConfigured, parseUsername, userProfile } from "../users.js";

const router = Router();

router.get("/status", (_req, res) => {
  res.json({ auth_required: authEnabled() });
});

router.post("/login", (req, res) => {
  const { password, username } = req.body as { password?: string; username?: string };
  if (authEnabled() && !loginLabelsConfigured()) {
    res.status(503).json({ error: "Sign-in unavailable" });
    return;
  }
  const userId = parseUsername(username ?? "");
  if (!userId) {
    res.status(401).json({ error: "Unknown name" });
    return;
  }
  if (!authEnabled()) {
    const profile = userProfile(userId);
    res.json({
      token: createToken(userId),
      auth_required: false,
      user: userId,
      label: profile.label,
      features: profile.features,
      users: listAuthUsers(),
    });
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
    users: listAuthUsers(),
  });
});

router.get("/me", requireAuth, (req, res) => {
  const details = verifyTokenDetails(bearerToken(req));
  const profile = userProfile(details.userId);
  res.json({
    user: profile.id,
    label: profile.label,
    features: profile.features,
    users: listAuthUsers(),
  });
});

export default router;
