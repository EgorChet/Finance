import type { LivingBudgetData, LivingBudgetSegment } from "../types.js";
import { readLivingBudget, writeLivingBudget } from "../storage/index.js";

export const ONGOING_THROUGH_MONTH = "2035-12";
const MONTH_RE = /^\d{4}-\d{2}$/;

let cached: LivingBudgetSegment[] | null = null;

export function normalizeSegment(segment: LivingBudgetSegment): LivingBudgetSegment {
  return {
    amount: Math.round(segment.amount * 100) / 100,
    from_month: segment.from_month.trim(),
    through_month: segment.through_month.trim(),
  };
}

function mergeSegments(user: LivingBudgetData): LivingBudgetSegment[] {
  return (user.segments || []).map(normalizeSegment);
}

export async function refreshLivingBudgetCache(): Promise<void> {
  const user = await readLivingBudget();
  cached = mergeSegments(user);
}

function ensureCache(): void {
  if (!cached) cached = [];
}

export function loadLivingBudgetSegments(): LivingBudgetSegment[] {
  ensureCache();
  return cached!;
}

export function livingBudgetForMonth(ym: string, segments = loadLivingBudgetSegments()): number | null {
  const match = segments.find((s) => s.from_month <= ym && ym <= s.through_month);
  return match?.amount ?? null;
}

function segmentsOverlap(a: LivingBudgetSegment, b: LivingBudgetSegment): boolean {
  return a.from_month <= b.through_month && b.from_month <= a.through_month;
}

export function validateLivingBudget(segments: LivingBudgetSegment[]): string | null {
  if (!segments.length) return "At least one budget period is required";
  for (const raw of segments) {
    const segment = normalizeSegment(raw);
    if (!Number.isFinite(segment.amount) || segment.amount <= 0) return "Each budget amount must be positive";
    if (!MONTH_RE.test(segment.from_month) || !MONTH_RE.test(segment.through_month)) {
      return "Months must be YYYY-MM";
    }
    if (segment.from_month > segment.through_month) {
      return "Start month must be on or before end month";
    }
  }
  const sorted = [...segments].map(normalizeSegment).sort((a, b) => a.from_month.localeCompare(b.from_month));
  for (let i = 1; i < sorted.length; i += 1) {
    if (segmentsOverlap(sorted[i - 1], sorted[i])) {
      return "Budget periods must not overlap";
    }
  }
  return null;
}

export async function saveLivingBudget(segments: LivingBudgetSegment[]): Promise<LivingBudgetSegment[]> {
  const normalized = segments.map(normalizeSegment).sort((a, b) => a.from_month.localeCompare(b.from_month));
  const error = validateLivingBudget(normalized);
  if (error) throw new Error(error);
  await writeLivingBudget({ segments: normalized });
  cached = null;
  await refreshLivingBudgetCache();
  const persisted = loadLivingBudgetSegments();
  if (persisted.length !== normalized.length) {
    throw new Error(
      "Living budget did not persist — check that Render has deployed the latest API and Supabase credentials are set.",
    );
  }
  return persisted;
}
