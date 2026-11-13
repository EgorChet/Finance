/**
 * Brand marks for merchants you pay often — no outside service, nothing to load:
 * - international brands use their real logo (simple-icons, bundled in brandIcons.ts);
 * - Israeli brands that aren't in that set get a round badge in the brand's colour with its
 *   initials (like Revolut's merchant avatars).
 * Anything not listed keeps the category emoji. Patterns are tested against
 * "merchant_he merchant_en"; first match wins.
 */
import { BRAND_ICONS } from "./brandIcons";

type Mark = { icon: string } | { text: string; bg: string; fg?: string };

const BRANDS: [RegExp, Mark][] = [
  // Coffee & bakeries
  [/arcaffe|ארקפה/i, { text: "A", bg: "#8B1E2D" }],
  [/aroma|ארומה/i, { text: "a", bg: "#E31B23" }],
  [/קפה קפה|cafe cafe/i, { text: "CC", bg: "#5B3A29" }],
  [/roladin|רולדין/i, { text: "R", bg: "#1A1A1A" }],
  [/benedict|בנדיקט/i, { text: "B", bg: "#F2A900", fg: "#1A1A1A" }],
  [/landwer|לנדוור/i, { text: "L", bg: "#1F3A5F" }],
  [/biscotti|ביסקוטי/i, { text: "B", bg: "#8A5A44" }],
  // Groceries & pharmacy
  [/tiv ?taam|טיב טעם/i, { text: "TT", bg: "#00843D" }],
  [/shufersal|שופרסל/i, { text: "S", bg: "#E2001A" }],
  [/rami ?levy|רמי לוי/i, { text: "RL", bg: "#003DA5" }],
  [/yochananof|יוחננוף/i, { text: "Y", bg: "#E4002B" }],
  [/victory|ויקטורי/i, { text: "V", bg: "#E30613" }],
  [/super-?pharm|סופר פארם/i, { text: "SP", bg: "#E4002B" }],
  [/good ?pharm|גוד פארם/i, { text: "GP", bg: "#6CB33F" }],
  [/iherb/i, { text: "iH", bg: "#458500" }],
  // Home & shopping
  [/ikea|איקאה/i, { icon: "ikea" }],
  [/zara|זארה/i, { icon: "zara" }],
  [/nike|נייקי/i, { icon: "nike" }],
  [/h&m|\bhm\b/i, { icon: "handm" }],
  [/castro|קסטרו/i, { text: "C", bg: "#000000" }],
  [/\bfox\b|פוקס/i, { text: "F", bg: "#000000" }],
  [/temu/i, { text: "T", bg: "#FB7701" }],
  [/shein/i, { text: "S", bg: "#000000" }],
  [/aliexpress/i, { icon: "aliexpress" }],
  // Subscriptions & tech
  [/apple/i, { icon: "apple" }],
  [/openai|chatgpt/i, { text: "AI", bg: "#10A37F" }],
  [/anthropic|claude/i, { icon: "claude" }],
  [/cursor/i, { icon: "cursor" }],
  [/\baws\b|amazon web services/i, { text: "aws", bg: "#232F3E", fg: "#FF9900" }],
  [/amazon|amzn/i, { text: "a", bg: "#FF9900", fg: "#1A1A1A" }],
  [/midjourney/i, { text: "M", bg: "#000000" }],
  [/render\.com/i, { icon: "render" }],
  [/netflix/i, { icon: "netflix" }],
  [/spotify/i, { icon: "spotify" }],
  [/youtube/i, { icon: "youtube" }],
  [/google/i, { icon: "google" }],
  // Phone, internet, utilities, city
  [/hot mobile|הוט מובייל|^hot\b/i, { text: "HOT", bg: "#E4002B" }],
  [/בזק|bezeq/i, { text: "B", bg: "#0A3D91" }],
  [/partner|פרטנר/i, { text: "P", bg: "#00A3E0" }],
  [/cellcom|סלקום/i, { text: "C", bg: "#6A2C91" }],
  [/חברת החשמל|israel electric/i, { text: "⚡", bg: "#F28C00" }],
  [/סופרגז|supergas/i, { text: "SG", bg: "#0060A9" }],
  [/אמישראגז|amisragas/i, { text: "AG", bg: "#F7A800", fg: "#1A1A1A" }],
  [/מי נתניה/i, { text: "💧", bg: "#00A9E0" }],
  [/עיריית נתניה/i, { text: "N", bg: "#1D4F91" }],
  // Transport & delivery
  [/pango|פנגו/i, { text: "P", bg: "#00B2A9" }],
  [/moovit|מוביט/i, { text: "M", bg: "#F26B21" }],
  [/gett/i, { text: "G", bg: "#FFD200", fg: "#1A1A1A" }],
  [/yango/i, { text: "Y", bg: "#FC3F1D" }],
  [/uber/i, { icon: "uber" }],
  [/wolt/i, { text: "W", bg: "#009DE0" }],
  [/waze/i, { icon: "waze" }],
  [/\bpaz\b|^פז /i, { text: "פז", bg: "#FFD100", fg: "#1A1A1A" }],
  [/delek|^דלק /i, { text: "D", bg: "#E30613" }],
  [/sonol|סונול/i, { text: "S", bg: "#FFD200", fg: "#1A1A1A" }],
  [/booking/i, { icon: "bookingdotcom" }],
  // Money, health, insurance
  [/paybox|פייבוקס/i, { text: "P", bg: "#00B1EB" }],
  [/\bbit\b/i, { text: "bit", bg: "#00A99D" }],
  [/סיבוס|cibus|pluxee/i, { text: "C", bg: "#1E2C78" }],
  [/לאומי|leumi/i, { text: "L", bg: "#1F57A3" }],
  [/מכבי|maccabi/i, { text: "M", bg: "#00539B" }],
  [/ביטוח חקלאי/i, { text: "BH", bg: "#2E7D32" }],
  [/revolut/i, { icon: "revolut" }],
  [/paypal/i, { icon: "paypal" }],
];

export type MerchantMark =
  | { kind: "icon"; path: string; bg: string; fg: string; title: string }
  | { kind: "badge"; text: string; bg: string; fg: string };

const cache = new Map<string, MerchantMark | null>();

/** Light brand colours get a dark mark, dark ones a white mark. */
function contrastOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 170 ? "#1A1A1A" : "#FFFFFF";
}

export function merchantMark(merchantHe: string | null | undefined, merchantEn?: string | null): MerchantMark | null {
  const text = `${merchantHe ?? ""} ${merchantEn ?? ""}`.trim();
  if (!text) return null;
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  const mark = BRANDS.find(([re]) => re.test(text))?.[1];
  let out: MerchantMark | null = null;
  if (mark && "icon" in mark) {
    const icon = BRAND_ICONS[mark.icon];
    if (icon) out = { kind: "icon", path: icon.path, bg: icon.hex, fg: contrastOn(icon.hex), title: icon.title };
  } else if (mark) {
    out = { kind: "badge", text: mark.text, bg: mark.bg, fg: mark.fg ?? contrastOn(mark.bg) };
  }
  cache.set(text, out);
  return out;
}
