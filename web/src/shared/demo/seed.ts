/**
 * The demo household, generated in the browser: ten billing cycles of believable card spending
 * up to today, with everything the real app handles — regular bills (monthly and every two
 * months), subscriptions in dollars, BIT and PayBox, installments, a standing order, a refund,
 * merchants still waiting for a name, charges entered by hand and extra money for this month.
 *
 * Every day's charges come from a generator seeded by that date, so a charge keeps its date and
 * amount from one visit to the next (edits are keyed by it), while new days keep appearing.
 */
import type { Transaction, MerchantRules } from "@/shared/types";
import type { ConfiguredCharge } from "@/features/household/utils/fixedCharges";
import type { LivingBudgetMonthTopup, LivingBudgetSegment } from "@/features/household/utils/livingBudget";

export const DEMO_CYCLE_DAY = 10;
/** Completed cycles before the open one. */
const PAST_CYCLES = 9;

// ── dates ──
export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function parse(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addMonths(s: string, n: number): string {
  const d = parse(s);
  return iso(new Date(d.getFullYear(), d.getMonth() + n, d.getDate()));
}
function addDays(s: string, n: number): string {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}
/** Start (the 10th) of the cycle that contains `day`. */
export function cycleStartOf(day: string): string {
  const d = parse(day);
  const start = d.getDate() >= DEMO_CYCLE_DAY
    ? new Date(d.getFullYear(), d.getMonth(), DEMO_CYCLE_DAY)
    : new Date(d.getFullYear(), d.getMonth() - 1, DEMO_CYCLE_DAY);
  return iso(start);
}
/** Day `day` (1 = the 10th) of the cycle starting `start`, clamped to the cycle. */
function cycleDate(start: string, offset: number): string {
  return addDays(start, Math.max(0, Math.min(29, offset)));
}

// ── seeded randomness ──
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const money = (n: number) => Math.round(n * 100) / 100;

// ── merchants ──
type Everyday = { he: string; p: number; min: number; max: number; weekend?: number };

/** Day-to-day places: chance per day and an amount range. */
const EVERYDAY: Everyday[] = [
  { he: "שופרסל דיל נתניה", p: 0.22, min: 95, max: 460, weekend: 1.6 },
  { he: "טיב טעם נתניה", p: 0.13, min: 70, max: 380, weekend: 1.4 },
  { he: "סופר פארם נתניה", p: 0.09, min: 35, max: 210 },
  { he: "גוד פארם", p: 0.04, min: 25, max: 120 },
  { he: "ארקפה עיר ימים", p: 0.24, min: 17, max: 46 },
  { he: "ארומה נתניה", p: 0.12, min: 16, max: 42 },
  { he: "רולדין", p: 0.05, min: 28, max: 95 },
  { he: "WOLT", p: 0.17, min: 58, max: 190, weekend: 1.5 },
  { he: "מקדונלד'ס", p: 0.04, min: 45, max: 95 },
  { he: "חומוס אליהו", p: 0.04, min: 48, max: 120 },
  { he: "פנגו", p: 0.12, min: 6, max: 38 },
  { he: "דלק נתניה", p: 0.07, min: 170, max: 330 },
  { he: "GETT", p: 0.05, min: 32, max: 95 },
  { he: "רכבת ישראל", p: 0.04, min: 14, max: 42 },
  { he: "זארה", p: 0.025, min: 140, max: 460 },
  { he: "H&M", p: 0.025, min: 70, max: 260 },
  { he: "איקאה נתניה", p: 0.018, min: 90, max: 620 },
  { he: "KSP", p: 0.018, min: 80, max: 560 },
  { he: "מובילנד", p: 0.03, min: 70, max: 150, weekend: 2 },
  { he: "מכבי שירותי בריאות", p: 0.03, min: 25, max: 140 },
  { he: "פט פלנט", p: 0.04, min: 55, max: 210 },
  { he: "העברה ב BIT", p: 0.07, min: 40, max: 380 },
  // Not named yet: these wait in Review.
  { he: "מאפיית סאלי", p: 0.05, min: 22, max: 64 },
  { he: "קפה גרגר", p: 0.05, min: 18, max: 52 },
  { he: "פיצה שמש", p: 0.025, min: 55, max: 130 },
  { he: "דוכן פירות הדר", p: 0.03, min: 25, max: 90 },
];

/** Names and categories already saved (the same thing Review saves). */
export const DEMO_RULES: MerchantRules = {
  "שופרסל דיל נתניה": { english: "Shufersal", category: "Groceries" },
  "טיב טעם נתניה": { english: "Tiv Taam", category: "Groceries" },
  "סופר פארם נתניה": { english: "Super-Pharm", category: "Health & Medical" },
  "גוד פארם": { english: "Good Pharm", category: "Health & Medical" },
  "ארקפה עיר ימים": { english: "Arcaffe", category: "Coffee" },
  "ארומה נתניה": { english: "Aroma", category: "Coffee" },
  "רולדין": { english: "Roladin", category: "Coffee" },
  WOLT: { english: "Wolt", category: "Eating out" },
  "מקדונלד'ס": { english: "McDonald's", category: "Eating out" },
  "חומוס אליהו": { english: "Hummus Eliyahu", category: "Eating out" },
  "פנגו": { english: "Pango", category: "Transport" },
  "דלק נתניה": { english: "Delek", category: "Transport" },
  GETT: { english: "Gett", category: "Transport" },
  "רכבת ישראל": { english: "Israel Railways", category: "Transport" },
  "זארה": { english: "Zara", category: "Clothes" },
  "H&M": { english: "H&M", category: "Clothes" },
  "איקאה נתניה": { english: "IKEA", category: "Home & Furniture" },
  KSP: { english: "KSP", category: "Electronics & computers" },
  "מובילנד": { english: "Movieland Cinemas", category: "Leisure & Entertainment" },
  "מכבי שירותי בריאות": { english: "Maccabi Health Fund", category: "Health & Medical" },
  "פט פלנט": { english: "Pet Planet", category: "Pets" },
  "העברה ב BIT": { english: "BIT transfer", category: "BIT" },
  "ועד הבית": { english: "Vaad Bayit (building fee)", category: "Housing" },
  "בזק": { english: "Bezeq", category: "Subscriptions" },
  "הוט מובייל": { english: "HOT Mobile", category: "Mobile phone" },
  "OPENAI *CHATGPT SUBSCR": { english: "ChatGPT (OpenAI)", category: "Subscriptions" },
  "CURSOR, AI POWERED IDE": { english: "Cursor", category: "Subscriptions" },
  "ANTHROPIC* CLAUDE SUB": { english: "Claude (Anthropic)", category: "Subscriptions" },
  "APPLE.COM/BILL": { english: "Apple", category: "Subscriptions" },
  "NETFLIX.COM": { english: "Netflix", category: "Subscriptions" },
  "SPOTIFY": { english: "Spotify", category: "Subscriptions" },
  "PAYBOX": { english: "PayBox", category: "Nails" },
  "עיריית נתניה": { english: "Netanya Municipality (arnona)", category: "Housing" },
  "חברת החשמל": { english: "Israel Electric (IEC)", category: "Housing" },
  "מי נתניה": { english: "Mei Netanya (water)", category: "Housing" },
  "סופרגז": { english: "Supergas", category: "Housing" },
  "הראל ביטוח": { english: "Harel Insurance", category: "Government & Institutions" },
  "ELAL": { english: "El Al", category: "Tourism" },
  "BOOKING.COM": { english: "Booking.com", category: "Tourism" },
  "ALIEXPRESS": { english: "AliExpress", category: "Home & Living" },
  "איקאה ספה": { english: "IKEA", category: "Home & Furniture" },
};

/** Totoshka's guesses for the merchants still in Review. */
export const DEMO_AI_GUESSES: Record<string, { english_name: string; category: string; confidence: "low" | "medium" | "high"; reason: string }> = {
  "קפה גרגר": { english_name: "Cafe Greg", category: "Coffee", confidence: "high", reason: "Café Greg is a coffee chain; small amounts in the morning." },
  "פיצה שמש": { english_name: "Pizza Shemesh", category: "Eating out", confidence: "medium", reason: "Pizza place; dinner-time charges around ₪60–130." },
  "דוכן פירות הדר": { english_name: "Hadar Fruit Stand", category: "Groceries", confidence: "medium", reason: "“Dukhan perot” means fruit stand." },
};

function tx(date: string, he: string, amount: number, extra: Partial<Transaction> = {}): Transaction {
  const a = money(amount);
  return {
    date,
    merchant_he: he,
    merchant_en: "",
    amount: a,
    charge_amount: a,
    transaction_type_he: "רגילה",
    category_he: null,
    notes: null,
    category_en: "Uncategorized",
    merchant_known: false,
    ...extra,
  };
}

/** Bills and subscriptions on fixed days. `offset` = days after the 10th. */
function cycleBills(start: string, index: number, through: string): Transaction[] {
  const r = rng(`bills-${start}`);
  const out: Transaction[] = [];
  const add = (offset: number, he: string, amount: number, extra: Partial<Transaction> = {}) => {
    const date = cycleDate(start, offset);
    if (date <= through) out.push(tx(date, he, amount, extra));
  };
  const month = parse(start).getMonth();
  add(5, "ועד הבית", 454);
  add(21, "בזק", 160);
  add(22, "הוט מובייל", 105);
  add(11, "OPENAI *CHATGPT SUBSCR", 369.2 + Math.round(r() * 8), { amount: 100, original_currency: "USD" });
  add(14, "CURSOR, AI POWERED IDE", 185 + Math.round(r() * 6), { amount: 50, original_currency: "USD" });
  if (index >= 3) add(16, "ANTHROPIC* CLAUDE SUB", 61 + Math.round(r() * 4), { amount: 17, original_currency: "USD" });
  add(8, "APPLE.COM/BILL", 39.9);
  add(2, "NETFLIX.COM", 54.9);
  add(28, "SPOTIFY", 23.9);
  add(21, "הראל ביטוח", 212, { transaction_type_he: "הוראת קבע" });
  // Hairdresser (BIT ₪120) and nails (PayBox ₪220): no fixed rhythm.
  if (index % 3 !== 1) add(9 + Math.round(r() * 14), "העברה ב BIT", 120);
  if (index % 2 === 0) add(12 + Math.round(r() * 12), "PAYBOX", 220);
  // Every two months: arnona, electricity, water, gas.
  if (month % 2 === 0) {
    add(25, "עיריית נתניה", 1540 + Math.round(r() * 30));
    add(3, "מי נתניה", 270 + Math.round(r() * 70));
  } else {
    const summer = month >= 5 && month <= 8;
    add(4, "חברת החשמל", (summer ? 560 : 380) + Math.round(r() * 90));
    add(17, "סופרגז", 300 + Math.round(r() * 60));
  }
  return out;
}

/** Everyday spending for one day. */
function dayCharges(date: string): Transaction[] {
  const r = rng(`day-${date}`);
  const weekday = parse(date).getDay();
  const weekend = weekday === 5 || weekday === 6;
  const out: Transaction[] = [];
  for (const m of EVERYDAY) {
    const p = m.p * (weekend ? (m.weekend ?? 1.1) : 1);
    if (r() >= p) continue;
    const amount = m.min + (m.max - m.min) * Math.pow(r(), 1.4);
    out.push(tx(date, m.he, amount));
  }
  return out;
}

export interface DemoStatement {
  billing: string;
  cycleStart: string;
  partial: boolean;
  transactions: Transaction[];
}

/**
 * Ten statements: nine closed cycles and the open one (a partial snapshot up to today).
 * Installments (a flight and a sofa) run across the last cycles; one cycle has a trip abroad.
 */
export function buildDemoStatements(today: string): DemoStatement[] {
  const open = cycleStartOf(today);
  const out: DemoStatement[] = [];
  for (let k = PAST_CYCLES; k >= 0; k--) {
    const start = addMonths(open, -k);
    const end = addDays(addMonths(start, 1), -1);
    const through = k === 0 ? addDays(today, -1) : end;
    const index = PAST_CYCLES - k;
    const txs: Transaction[] = [];
    for (let d = start; d <= through; d = addDays(d, 1)) txs.push(...dayCharges(d));
    txs.push(...cycleBills(start, index, through));
    // Trip abroad four cycles ago: hotel in euros.
    if (k === 4) {
      txs.push(tx(cycleDate(start, 6), "BOOKING.COM", 2310, { amount: 585, original_currency: "EUR" }));
      txs.push(tx(cycleDate(start, 7), "ALIEXPRESS", 186.4, { amount: 51.2, original_currency: "USD" }));
    }
    // A refund three cycles ago.
    if (k === 3) txs.push(tx(cycleDate(start, 12), "זארה", -159.9, { transaction_type_he: "זיכוי" }));
    // Flights bought two cycles ago in 3 payments; a sofa in 6 payments.
    if (k <= 2) {
      txs.push(tx(cycleDate(addMonths(open, -2), 3), "ELAL", 1640, { transaction_type_he: "תשלומים", notes: `תשלום ${3 - k} מתוך 3` }));
    }
    if (k <= 5) {
      txs.push(tx(cycleDate(addMonths(open, -5), 9), "איקאה ספה", 690, { transaction_type_he: "תשלומים", notes: `תשלום ${6 - k} מתוך 6` }));
    }
    // A transfer between own accounts (excluded by default).
    if (k === 1) txs.push(tx(cycleDate(start, 15), "העברה לחשבון", 1500, { transaction_type_he: "העברה" }));
    const billing = addMonths(start, 1);
    out.push({ billing, cycleStart: start, partial: k === 0, transactions: txs.sort((a, b) => b.date.localeCompare(a.date)) });
  }
  return out;
}

export function demoFixedCharges(today: string): ConfiguredCharge[] {
  const open = cycleStartOf(today);
  const ym = (s: string) => s.slice(0, 7);
  const soon = addDays(today, 6) < addDays(addMonths(open, 1), -1) ? addDays(today, 6) : addDays(addMonths(open, 1), -2);
  return [
    { id: "car-loan", name_en: "Car loan", name_he: "הלוואת רכב", amount: 980, category_en: "Transport", from_month: "2024-03", through_month: "2028-02", schedule: "monthly" },
    { id: "cibus", name_en: "Cibus", name_he: "סיבוס", amount: 600, category_en: "Groceries", from_month: "2024-01", through_month: "2035-12", schedule: "monthly" },
    { id: "gym", name_en: "Gym", name_he: "חדר כושר", amount: 249, category_en: "Fitness", from_month: ym(addMonths(open, -7)), through_month: "2035-12", schedule: "monthly" },
    { id: "car-service", name_en: "Car service", amount: 1450, category_en: "Transport", from_month: ym(soon), through_month: ym(soon), schedule: "once", charge_date: soon },
    { id: "dentist", name_en: "Dentist", amount: 900, category_en: "Health & Medical", from_month: ym(addMonths(open, -1)), through_month: ym(addMonths(open, -1)), schedule: "once", charge_date: cycleDate(addMonths(open, -1), 18) },
  ];
}

export function demoLivingBudget(today: string): { segments: LivingBudgetSegment[]; month_topups: LivingBudgetMonthTopup[] } {
  const open = cycleStartOf(today);
  const raise = addMonths(open, -4).slice(0, 7);
  const before = addMonths(open, -5).slice(0, 7);
  const ym = open.slice(0, 7);
  return {
    segments: [
      { amount: 13200, from_month: "2025-01", through_month: before },
      { amount: 14500, from_month: raise, through_month: "2035-12" },
    ],
    month_topups: [
      { month: ym, extra: 400, note: "Birthday gift" },
      { month: ym, extra: 250, note: "Parking refund from work" },
      { month: addMonths(open, -2).slice(0, 7), extra: 600, note: "Left over from last month" },
    ],
  };
}

/** One dinner split with friends and one BIT transfer already sorted, so those screens aren't empty. */
export function demoStarterEdits(statements: DemoStatement[]) {
  const recent = statements.slice(-3).flatMap((s) => s.transactions);
  const wolt = recent.find((t) => t.merchant_he === "WOLT" && t.charge_amount > 120);
  const bit = recent.find((t) => t.merchant_he === "העברה ב BIT" && t.charge_amount !== 120 && t.charge_amount > 0);
  const transfer = statements.flatMap((s) => s.transactions).find((t) => t.merchant_he === "העברה לחשבון");
  return { wolt, bit, transfer };
}
