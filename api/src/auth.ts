import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";

const SECRET = process.env.AUTH_SECRET || "finance-dev-secret-change-me";

function loadPasswords(): string[] {
  const list = process.env.AUTH_PASSWORDS?.split(",").map((p) => p.trim()).filter(Boolean);
  if (list?.length) return list;
  const single = process.env.AUTH_PASSWORD?.trim();
  return single ? [single] : [];
}

const PASSWORDS = loadPasswords();

export function authEnabled(): boolean {
  return PASSWORDS.length > 0;
}

export function createToken(): string {
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!authEnabled()) return true;
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = createHmac("sha256", SECRET).update(payload).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    if (!timingSafeEqual(a, b)) return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { exp: number };
    return data.exp > Date.now();
  } catch {
    return false;
  }
}

export function checkPassword(password: string): boolean {
  if (!authEnabled()) return true;
  return PASSWORDS.some((p) => {
    try {
      const a = Buffer.from(password);
      const b = Buffer.from(p);
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!authEnabled()) {
    next();
    return;
  }
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (verifyToken(token)) {
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized" });
}

export function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : undefined;
}
