/**
 * Hints for labelling a Hebrew merchant: a translation, what the bank calls it, what else
 * was paid that day, earlier charges at the same place, and (when ANTHROPIC_API_KEY is set)
 * Claude's guess at the English name and category with a one-line reason.
 *
 * Sent to Claude: the Hebrew merchant name, the bank's category, the charge amount/date,
 * earlier amounts at that merchant and the names of other merchants paid the same day.
 */
import Anthropic from "@anthropic-ai/sdk";
import { CATEGORY_PICKLIST } from "../../../core/categories.js";
import type { Transaction } from "../types.js";
import { translateMerchant } from "./analyzerClient.js";

export interface LabelHints {
  translation: string;
  bank_category: string | null;
  bank_category_he: string | null;
  same_day: { merchant: string; category: string; amount: number }[];
  history: { date: string; amount: number }[];
  ai: { english_name: string; category: string; confidence: "low" | "medium" | "high"; reason: string } | null;
  /** off = no API key configured; error = the call failed or was declined. */
  ai_status: "ok" | "off" | "error";
}

const HEBREW_RE = /[֐-׿]/;
const aiCache = new Map<string, LabelHints["ai"]>();
const translationCache = new Map<string, string>();
let client: Anthropic | null = null;

function displayName(tx: Transaction): string {
  const en = tx.merchant_en?.trim();
  if (en && !HEBREW_RE.test(en)) return en;
  return tx.merchant_he.trim();
}

async function translate(hebrew: string): Promise<string> {
  if (!HEBREW_RE.test(hebrew)) return hebrew;
  const cached = translationCache.get(hebrew);
  if (cached != null) return cached;
  try {
    const english = await translateMerchant(hebrew);
    translationCache.set(hebrew, english);
    return english;
  } catch {
    return "";
  }
}

const AI_SCHEMA = {
  type: "object",
  properties: {
    english_name: { type: "string", description: "Short English name of the business, as an English speaker would call it" },
    category: { type: "string", enum: [...CATEGORY_PICKLIST] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    reason: { type: "string", description: "One short sentence: what the Hebrew means and why this category" },
  },
  required: ["english_name", "category", "confidence", "reason"],
  additionalProperties: false,
} as const;

const SYSTEM = `You help an English speaker in Israel who doesn't read Hebrew label merchants from their Leumi Visa credit-card statement.
Given a Hebrew merchant name and context, give the business's English name and the best spending category from the allowed list.
Use what you know about Israeli chains and brands. If the name is ambiguous, say so in the reason and set confidence to low.`;

async function askClaude(
  hebrew: string,
  context: { translation: string; bankCategoryHe: string | null; amount: number; date: string; sameDay: string[]; history: string[] },
): Promise<LabelHints["ai"]> {
  client ??= new Anthropic();
  const lines = [
    `Merchant on the statement: ${hebrew}`,
    context.translation ? `Machine translation: ${context.translation}` : null,
    context.bankCategoryHe ? `Bank's own category (Hebrew): ${context.bankCategoryHe}` : null,
    `This charge: ₪${context.amount} on ${context.date}`,
    context.history.length ? `Other charges at this merchant: ${context.history.join(", ")}` : null,
    context.sameDay.length ? `Other places paid the same day: ${context.sameDay.join("; ")}` : null,
  ].filter(Boolean);

  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: AI_SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: lines.join("\n") }],
  });
  if (response.stop_reason === "refusal") return null;
  for (const block of response.content) {
    if (block.type !== "text") continue;
    const parsed = JSON.parse(block.text) as NonNullable<LabelHints["ai"]>;
    if (!(CATEGORY_PICKLIST as readonly string[]).includes(parsed.category)) return null;
    return parsed;
  }
  return null;
}

export async function buildLabelHints(
  allTransactions: Transaction[],
  target: { merchant_he: string; date: string; charge_amount: number; category_he?: string | null; category_en?: string },
  options: { ai?: boolean } = {},
): Promise<LabelHints> {
  const hebrew = target.merchant_he.trim();
  const day = target.date.slice(0, 10);

  const sameDay = allTransactions
    .filter((t) => t.date.slice(0, 10) === day && t.merchant_he.trim() !== hebrew && t.charge_amount > 0)
    .sort((a, b) => b.charge_amount - a.charge_amount)
    .slice(0, 8)
    .map((t) => ({ merchant: displayName(t), category: t.category_en || "Uncategorized", amount: t.charge_amount }));

  const seen = new Set<string>();
  const history = allTransactions
    .filter((t) => t.merchant_he.trim() === hebrew)
    .map((t) => ({ date: t.date.slice(0, 10), amount: t.charge_amount }))
    .filter((h) => {
      const k = `${h.date}|${h.amount}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 12);

  const translation = await translate(hebrew);
  const bankCategoryHe = target.category_he?.trim() || null;
  const bankCategory = target.category_en && target.category_en !== "Uncategorized" ? target.category_en : null;

  let ai: LabelHints["ai"] = null;
  let aiStatus: LabelHints["ai_status"] = "off";
  if (options.ai !== false && process.env.ANTHROPIC_API_KEY) {
    const cacheKey = `${hebrew}|${day}|${target.charge_amount}`;
    if (aiCache.has(cacheKey)) {
      ai = aiCache.get(cacheKey) ?? null;
      aiStatus = ai ? "ok" : "error";
    } else {
      try {
        ai = await askClaude(hebrew, {
          translation,
          bankCategoryHe,
          amount: target.charge_amount,
          date: day,
          sameDay: sameDay.map((s) => `${s.merchant} (${s.category}, ₪${s.amount})`),
          history: history.map((h) => `₪${h.amount} on ${h.date}`),
        });
        aiStatus = ai ? "ok" : "error";
        if (ai) aiCache.set(cacheKey, ai);
      } catch (e) {
        if (e instanceof Anthropic.APIError) console.error(`label hints: Claude API ${e.status}: ${e.message}`);
        else console.error("label hints:", e);
        aiStatus = "error";
      }
    }
  }

  return {
    translation,
    bank_category: bankCategory,
    bank_category_he: bankCategoryHe,
    same_day: sameDay,
    history,
    ai,
    ai_status: aiStatus,
  };
}
