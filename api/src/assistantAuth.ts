import { timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { requireAuth, type AuthenticatedRequest } from "./auth.js";

/**
 * Machine access for the Telegram assistant (Totoshka).
 *
 * A request with a valid `X-Assistant-Key` header is let through as Egor, but only for
 * the routes listed below. Anything else carrying the key is refused, so the assistant
 * can never delete statements, overwrite the whole rules file, re-run sync or reset
 * review progress. Requests without the header fall through to the normal login.
 *
 * Set ASSISTANT_KEY on the API server (generate: openssl rand -hex 32).
 * Paths are relative to the /api mount.
 */
type Method = "GET" | "POST" | "PUT";

const ALLOWED: Record<Method, RegExp[]> = {
  GET: [
    /^\/warm-analyzer$/,
    /^\/config$/,
    /^\/months$/,
    /^\/home-data$/,
    /^\/report$/,
    /^\/rules$/,
    /^\/fixed-charges$/,
    /^\/living-budget$/,
    /^\/exclusions$/,
    /^\/adjustments$/,
    /^\/review\/progress$/,
    /^\/review\/queue$/,
    /^\/review\/suggest$/,
    /^\/kaspa$/,
    /^\/fxcn$/,
    /^\/market-snapshot$/,
    /^\/upload\/jobs\/[\w-]+$/,
    /^\/settings$/,
    /^\/summary$/,
  ],
  POST: [
    /^\/exclusions$/,
    /^\/exclusions\/remove$/,
    /^\/adjustments$/,
    /^\/adjustments\/remove$/,
    /^\/rules\/entry$/,
    /^\/review\/confirm$/,
    /^\/upload\/jobs$/,
  ],
  PUT: [/^\/fixed-charges$/, /^\/living-budget$/, /^\/review\/progress$/, /^\/settings$/],
};

function assistantKey(): string | undefined {
  return process.env.ASSISTANT_KEY?.trim() || undefined;
}

function headerValue(req: Request): string | undefined {
  const raw = req.headers["x-assistant-key"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function assistantRouteAllowed(method: string, path: string): boolean {
  const patterns = ALLOWED[method.toUpperCase() as Method];
  return Boolean(patterns?.some((re) => re.test(path)));
}

/** Use in place of requireAuth on the /api mount. */
export function requireAuthOrAssistant(req: Request, res: Response, next: NextFunction): void {
  const provided = headerValue(req);
  if (!provided) {
    requireAuth(req, res, next);
    return;
  }
  const expected = assistantKey();
  if (!expected || !safeEqual(provided, expected)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!assistantRouteAllowed(req.method, req.path)) {
    console.warn(`Assistant key refused: ${req.method} ${req.path}`);
    res.status(403).json({ error: "Not allowed for the assistant key" });
    return;
  }
  (req as AuthenticatedRequest).userId = "egor";
  next();
}
