import { createHash } from "crypto";
import { loadAdjustments } from "./adjustments.js";
import { loadExcludedKeys } from "./exclusions.js";
import { loadFixedCharges } from "./fixedCharges.js";
import { loadLivingBudgetData } from "./livingBudget.js";
import { readRules } from "../storage/index.js";

/** Retired categories — must match reportService CATEGORY_ALIASES. */
const CATEGORY_ALIASES: Record<string, string> = {
  "Sibus Flexi": "Groceries",
  "Home & Electronics": "Home & Furniture",
};

/** Bump when FX / pending-currency normalization logic changes — forces stored reports to re-finalize. */
const FX_PIPELINE_VERSION = 2;

export async function getFinalizeVersion(): Promise<string> {
  const rules = await readRules();
  const fixed = loadFixedCharges();
  const budget = loadLivingBudgetData();
  const exclusions = [...loadExcludedKeys()].sort();
  const adjustments = [...loadAdjustments().keys()].sort();
  const payload = JSON.stringify({
    rules,
    fixed,
    budget: { segments: budget.segments, month_topups: budget.month_topups || [] },
    aliases: CATEGORY_ALIASES,
    exclusions,
    adjustments,
    fxPipeline: FX_PIPELINE_VERSION,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}
