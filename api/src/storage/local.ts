import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type {
  ExclusionsData,
  FixedChargesData,
  FxFallbackData,
  KaspaPriceCache,
  LivingBudgetData,
  MerchantRules,
  ReviewProgressData,
  StatementsData,
} from "../types.js";

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "..", "data");

const STATEMENTS_PATH = path.join(DATA_DIR, "statements.json");
const RULES_PATH = path.join(DATA_DIR, "merchant_rules.json");
const REVIEW_PATH = path.join(DATA_DIR, "review_progress.json");
const EXCLUSIONS_PATH = path.join(DATA_DIR, "user_exclusions.json");
const FIXED_CHARGES_PATH = path.join(DATA_DIR, "user_fixed_charges.json");
const LIVING_BUDGET_PATH = path.join(DATA_DIR, "user_living_budget.json");
const FX_FALLBACK_PATH = path.join(DATA_DIR, "fx_fallback.json");
const KASPA_PRICE_PATH = path.join(DATA_DIR, "kaspa_price.json");
const PROJECT_ROOT = path.resolve(DATA_DIR, "..");
const STATEMENTS_DIR = path.join(PROJECT_ROOT, "statements");
const XLSX_DIRS = [STATEMENTS_DIR];

export function fileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function readStatements(): Promise<StatementsData> {
  try {
    const raw = await fs.readFile(STATEMENTS_PATH, "utf-8");
    return JSON.parse(raw) as StatementsData;
  } catch {
    return { statements: {}, updated_at: null };
  }
}

export async function writeStatements(data: StatementsData): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  data.updated_at = new Date().toISOString();
  await fs.writeFile(STATEMENTS_PATH, JSON.stringify(data, null, 2), "utf-8");
}

export async function readRules(): Promise<MerchantRules> {
  try {
    const raw = await fs.readFile(RULES_PATH, "utf-8");
    return JSON.parse(raw) as MerchantRules;
  } catch {
    return {};
  }
}

export async function writeRules(rules: MerchantRules): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(RULES_PATH, JSON.stringify(rules, null, 2), "utf-8");
}

export async function readReviewProgress(): Promise<ReviewProgressData> {
  try {
    const raw = await fs.readFile(REVIEW_PATH, "utf-8");
    const data = JSON.parse(raw) as ReviewProgressData;
    return {
      reviewed_transactions: data.reviewed_transactions || [],
      reviewed_merchants: data.reviewed_merchants || [],
    };
  } catch {
    return { reviewed_transactions: [], reviewed_merchants: [] };
  }
}

export async function writeReviewProgress(data: ReviewProgressData): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(REVIEW_PATH, JSON.stringify(data, null, 2), "utf-8");
}

export async function readExclusions(): Promise<ExclusionsData> {
  try {
    const raw = await fs.readFile(EXCLUSIONS_PATH, "utf-8");
    const data = JSON.parse(raw) as ExclusionsData;
    return {
      entries: data.entries || [],
      restored_keys: data.restored_keys || [],
      updated_at: data.updated_at ?? null,
    };
  } catch {
    return { entries: [], restored_keys: [], updated_at: null };
  }
}

export async function writeExclusions(data: ExclusionsData): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  data.updated_at = new Date().toISOString();
  await fs.writeFile(EXCLUSIONS_PATH, JSON.stringify(data, null, 2), "utf-8");
}

export async function readFixedCharges(): Promise<FixedChargesData> {
  try {
    const raw = await fs.readFile(FIXED_CHARGES_PATH, "utf-8");
    const data = JSON.parse(raw) as FixedChargesData;
    return { charges: data.charges || [], updated_at: data.updated_at ?? null };
  } catch {
    return { charges: [], updated_at: null };
  }
}

export async function writeFixedCharges(data: FixedChargesData): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  data.updated_at = new Date().toISOString();
  await fs.writeFile(FIXED_CHARGES_PATH, JSON.stringify(data, null, 2), "utf-8");
}

export async function readLivingBudget(): Promise<LivingBudgetData> {
  try {
    const raw = await fs.readFile(LIVING_BUDGET_PATH, "utf-8");
    const data = JSON.parse(raw) as LivingBudgetData;
    return { segments: data.segments || [], updated_at: data.updated_at ?? null };
  } catch {
    return { segments: [], updated_at: null };
  }
}

export async function writeLivingBudget(data: LivingBudgetData): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  data.updated_at = new Date().toISOString();
  await fs.writeFile(LIVING_BUDGET_PATH, JSON.stringify(data, null, 2), "utf-8");
}

export async function readFxFallback(): Promise<FxFallbackData> {
  try {
    const raw = await fs.readFile(FX_FALLBACK_PATH, "utf-8");
    const data = JSON.parse(raw) as Partial<FxFallbackData>;
    return { updated: data.updated ?? "", rates: data.rates ?? {} };
  } catch {
    return { updated: "", rates: {} };
  }
}

export async function writeFxFallback(data: FxFallbackData): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FX_FALLBACK_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export async function readKaspaPriceCache(): Promise<KaspaPriceCache> {
  try {
    const raw = await fs.readFile(KASPA_PRICE_PATH, "utf-8");
    const data = JSON.parse(raw) as Partial<KaspaPriceCache>;
    return {
      updated_at: data.updated_at ?? "",
      price_usdt: data.price_usdt ?? 0,
      source: data.source,
    };
  } catch {
    return { updated_at: "", price_usdt: 0 };
  }
}

export async function writeKaspaPriceCache(data: KaspaPriceCache): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(KASPA_PRICE_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export async function discoverXlsxFiles(): Promise<string[]> {
  const found = new Set<string>();
  for (const dir of XLSX_DIRS) {
    try {
      const entries = await fs.readdir(dir);
      for (const name of entries) {
        if (name.endsWith(".xlsx")) {
          found.add(path.join(dir, name));
        }
      }
    } catch {
      /* skip missing dirs */
    }
  }
  return [...found].sort();
}

export async function saveUploadedXlsx(filename: string, buffer: Buffer): Promise<string> {
  if (process.env.STORAGE === "supabase") {
    return `upload:${filename}`;
  }
  await fs.mkdir(STATEMENTS_DIR, { recursive: true });
  const dest = path.join(STATEMENTS_DIR, filename);
  await fs.writeFile(dest, buffer);
  return dest;
}

export { DATA_DIR, STATEMENTS_PATH, RULES_PATH };
