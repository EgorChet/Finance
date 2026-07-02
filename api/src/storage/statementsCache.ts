import type { StatementsData } from "../types.js";

let cached: StatementsData | null = null;
let cachedAt = 0;

const TTL_MS = Number(process.env.STATEMENTS_CACHE_TTL_MS || 20_000);

export function invalidateStatementsCache(): void {
  cached = null;
  cachedAt = 0;
}

export async function readStatementsWithCache(
  readFn: () => Promise<StatementsData>,
): Promise<StatementsData> {
  const now = Date.now();
  if (cached && now - cachedAt < TTL_MS) return cached;
  cached = await readFn();
  cachedAt = now;
  return cached;
}
