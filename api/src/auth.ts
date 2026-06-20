import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { passwordForUser, parseUserId, type HouseholdUserId } from "./users.js";

const SECRET = process.env.AUTH_SECRET || "finance-dev-secret-change-me";

function loadLegacyPasswords(): string[] {
  const list = process.env.AUTH_PASSWORDS?.split(",").map((p) => p.trim()).filter(Boolean);
  if (list?.length) return list;
  const single = process.env.AUTH_PASSWORD?.trim();
  return single ? [single] : [];
}

const LEGACY_PASSWORDS = loadLegacyPasswords();

export function authEnabled(): boolean {
  if (LEGACY_PASSWORDS.length) return true;
  return Boolean(
    process.env.AUTH_PASSWORD?.trim() ||
      process.env.AUTH_USER_EGOR?.trim() ||
      process.env.AUTH_USER_JULIA?.trim() ||
      process.env.AUTH_PASSWORD_JULIA?.trim(),
  );
}

export type TokenDetails = {
  valid: boolean;
  userId: HouseholdUserId;
};

export function createToken(userId: HouseholdUserId = "egor"): string {
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ exp, user: userId })).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function parseToken(token: string | undefined): TokenDetails {
  if (!token) return { valid: !authEnabled(), userId: "egor" };
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return { valid: false, userId: "egor" };
  const expected = createHmac("sha256", SECRET).update(payload).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { valid: false, userId: "egor" };
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { exp: number; user?: string };
    if (data.exp <= Date.now()) return { valid: false, userId: "egor" };
    const userId = parseUserId(data.user) ?? "egor";
    return { valid: true, userId };
  } catch {
    return { valid: false, userId: "egor" };
  }
}

export function verifyToken(token: string | undefined): boolean {
  if (!authEnabled()) return true;
  return parseToken(token).valid;
}

export function verifyTokenDetails(token: string | undefined): TokenDetails {
  if (!authEnabled()) return { valid: true, userId: "egor" };
  return parseToken(token);
}

function safeEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function checkPassword(password: string, userId: HouseholdUserId): boolean {
  if (!authEnabled()) return true;
  const expected = passwordForUser(userId);
  if (expected) return safeEqual(password, expected);
  return LEGACY_PASSWORDS.some((p) => safeEqual(password, p));
}

export interface AuthenticatedRequest extends Request {
  userId?: HouseholdUserId;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!authEnabled()) {
    (req as AuthenticatedRequest).userId = "egor";
    next();
    return;
  }
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
  const details = parseToken(token);
  if (!details.valid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as AuthenticatedRequest).userId = details.userId;
  next();
}

export function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : undefined;
}

export function userIdFromRequest(req: Request): HouseholdUserId {
  return (req as AuthenticatedRequest).userId ?? "egor";
}
