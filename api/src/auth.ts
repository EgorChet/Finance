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
  if (!READ_METHODS.has(req.method) && isBudgetWrite(req.path) && !userCanEditBudget(details.userId)) {
    res.status(403).json({ error: "Only Egor can change the budget." });
    return;
  }
  (req as AuthenticatedRequest).userId = details.userId;
  next();
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Both household members see everything and can label, split, exclude, upload and sync. */
export function userCanEdit(_userId: HouseholdUserId): boolean {
  return true;
}

/** The budget itself (budget periods, recurring and one-time charges) is Egor's. */
export function userCanEditBudget(userId: HouseholdUserId): boolean {
  return userId === "egor";
}

/** Writes that change the budget. Paths are relative to the /api mount. */
const BUDGET_WRITE_PATHS = [/^\/living-budget\/?$/, /^\/fixed-charges\/?$/];

function isBudgetWrite(path: string): boolean {
  return BUDGET_WRITE_PATHS.some((re) => re.test(path));
}

export function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : undefined;
}

export function userIdFromRequest(req: Request): HouseholdUserId {
  return (req as AuthenticatedRequest).userId ?? "egor";
}

/** Machine auth for Google Drive / Apps Script ingest (not the household login password). */
export function ingestSecret(): string | undefined {
  const value = process.env.INGEST_SECRET?.trim();
  return value || undefined;
}

export function ingestEnabled(): boolean {
  return Boolean(ingestSecret());
}

function ingestKeyFromRequest(req: Request): string | undefined {
  const header = req.headers["x-ingest-key"];
  if (typeof header === "string" && header.trim()) return header.trim();
  if (Array.isArray(header) && header[0]?.trim()) return header[0].trim();
  return undefined;
}

export function requireIngestKey(req: Request, res: Response, next: NextFunction): void {
  const expected = ingestSecret();
  if (!expected) {
    res.status(503).json({ error: "Ingest is not configured — set INGEST_SECRET on the API server" });
    return;
  }
  const provided = ingestKeyFromRequest(req);
  if (!provided || !safeEqual(provided, expected)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
