/**
 * Brand marks for merchants you pay often:
 * - international brands use their real logo (simple-icons, bundled in brandIcons.ts);
 * - the rest show their site's original logo when it's sharp (≥ 48px), otherwise a round badge
 *   in the brand's colour with its initials (like Revolut's merchant avatars) — never a globe
 *   or a blurry icon.
 * Anything not listed keeps the category emoji. Patterns are tested against
 * "merchant_he merchant_en"; first match wins.
 */
import { BRAND_ICONS } from "./brandIcons";

/** domain: the brand's site — its original logo is used when it's sharp enough, the badge otherwise. */
type Mark = { icon: string } | { text: string; bg: string; fg?: string; domain?: string };

const BRANDS: [RegExp, Mark][] = [
  // Coffee & bakeries
  [/arcaffe|ארקפה/i, { text: "A", bg: "#8B1E2D", domain: "arcaffe.co.il" }],
  [/aroma|ארומה/i, { text: "a", bg: "#E31B23", domain: "aroma.co.il" }],
  [/קפה קפה|cafe cafe/i, { text: "CC", bg: "#5B3A29", domain: "cafecafe.co.il" }],
  [/roladin|רולדין/i, { text: "R", bg: "#1A1A1A", domain: "roladin.co.il" }],
  [/benedict|בנדיקט/i, { text: "B", bg: "#F2A900", fg: "#1A1A1A", domain: "benedict.co.il" }],
  [/landwer|לנדוור/i, { text: "L", bg: "#1F3A5F", domain: "landwer.co.il" }],
  [/biscotti|ביסקוטי/i, { text: "B", bg: "#8A5A44", domain: "biscotti.co.il" }],
  // Groceries & pharmacy
  [/tiv ?taam|טיב טעם/i, { text: "TT", bg: "#00843D", domain: "tivtaam.co.il" }],
  [/shufersal|שופרסל/i, { text: "S", bg: "#E2001A", domain: "shufersal.co.il" }],
  [/rami ?levy|רמי לוי/i, { text: "RL", bg: "#003DA5", domain: "rami-levy.co.il" }],
  [/yochananof|יוחננוף/i, { text: "Y", bg: "#E4002B", domain: "yochananof.co.il" }],
  [/victory|ויקטורי/i, { text: "V", bg: "#E30613", domain: "victoryonline.co.il" }],
  [/super-?pharm|סופר פארם/i, { text: "SP", bg: "#E4002B", domain: "super-pharm.co.il" }],
  [/good ?pharm|גוד פארם/i, { text: "GP", bg: "#6CB33F", domain: "good-pharm.co.il" }],
  [/iherb/i, { text: "iH", bg: "#458500", domain: "iherb.com" }],
  // Home & shopping
  [/ikea|איקאה/i, { icon: "ikea" }],
  [/zara|זארה/i, { icon: "zara" }],
  [/nike|נייקי/i, { icon: "nike" }],
  [/h&m|\bhm\b/i, { icon: "handm" }],
  [/castro|קסטרו/i, { text: "C", bg: "#000000", domain: "castro.com" }],
  [/\bfox\b|פוקס/i, { text: "F", bg: "#000000", domain: "fox.co.il" }],
  [/temu/i, { text: "T", bg: "#FB7701", domain: "temu.com" }],
  [/shein/i, { text: "S", bg: "#000000", domain: "shein.com" }],
  [/aliexpress/i, { icon: "aliexpress" }],
  // Subscriptions & tech
  [/apple/i, { icon: "apple" }],
  [/openai|chatgpt/i, { text: "AI", bg: "#10A37F", domain: "openai.com" }],
  [/anthropic|claude/i, { icon: "claude" }],
  [/cursor/i, { icon: "cursor" }],
  [/\baws\b|amazon web services/i, { text: "aws", bg: "#232F3E", fg: "#FF9900", domain: "aws.amazon.com" }],
  [/amazon|amzn/i, { text: "a", bg: "#FF9900", fg: "#1A1A1A", domain: "amazon.com" }],
  [/midjourney/i, { text: "M", bg: "#000000", domain: "midjourney.com" }],
  [/render\.com/i, { icon: "render" }],
  [/netflix/i, { icon: "netflix" }],
  [/spotify/i, { icon: "spotify" }],
  [/youtube/i, { icon: "youtube" }],
  [/google/i, { icon: "google" }],
  // Phone, internet, utilities, city
  [/hot mobile|הוט מובייל|^hot\b/i, { text: "HOT", bg: "#E4002B", domain: "hot.net.il" }],
  [/בזק|bezeq/i, { text: "B", bg: "#0A3D91", domain: "bezeq.co.il" }],
  [/partner|פרטנר/i, { text: "P", bg: "#00A3E0", domain: "partner.co.il" }],
  [/cellcom|סלקום/i, { text: "C", bg: "#6A2C91", domain: "cellcom.co.il" }],
  [/חברת החשמל|israel electric/i, { text: "⚡", bg: "#F28C00", domain: "iec.co.il" }],
  [/סופרגז|supergas/i, { text: "SG", bg: "#0060A9", domain: "supergas.co.il" }],
  [/אמישראגז|amisragas/i, { text: "AG", bg: "#F7A800", fg: "#1A1A1A", domain: "amisragas.co.il" }],
  [/מי נתניה/i, { text: "💧", bg: "#00A9E0", domain: "mei-netanya.co.il" }],
  [/עיריית נתניה/i, { text: "N", bg: "#1D4F91", domain: "netanya.muni.il" }],
  // Transport & delivery
  [/pango|פנגו/i, { text: "P", bg: "#00B2A9", domain: "pango.co.il" }],
  [/ev ?edge|אי\.? ?וי\.? ?אדג/i, { text: "⚡", bg: "#00A651", domain: "evedge.co.il" }],
  [/goto|^גו טו/i, { text: "GT", bg: "#00C389", fg: "#1A1A1A", domain: "gotoglobal.com" }],
  [/moovit|מוביט/i, { text: "M", bg: "#F26B21", domain: "moovitapp.com" }],
  [/gett/i, { text: "G", bg: "#FFD200", fg: "#1A1A1A", domain: "gett.com" }],
  [/yango/i, { text: "Y", bg: "#FC3F1D", domain: "yango.com" }],
  [/uber/i, { icon: "uber" }],
  [/wolt/i, { text: "W", bg: "#009DE0", domain: "wolt.com" }],
  [/waze/i, { icon: "waze" }],
  [/\bpaz\b|^פז /i, { text: "פז", bg: "#FFD100", fg: "#1A1A1A", domain: "paz.co.il" }],
  [/delek|^דלק /i, { text: "D", bg: "#E30613", domain: "delek.co.il" }],
  [/sonol|סונול/i, { text: "S", bg: "#FFD200", fg: "#1A1A1A", domain: "sonol.co.il" }],
  [/booking/i, { icon: "bookingdotcom" }],
  // Money, health, insurance
  [/paybox|פייבוקס/i, { text: "P", bg: "#00B1EB", domain: "payboxapp.com" }],
  [/\bbit\b/i, { text: "bit", bg: "#00A99D", domain: "bitpay.co.il" }],
  [/סיבוס|cibus|pluxee/i, { text: "C", bg: "#1E2C78", domain: "pluxee.co.il" }],
  [/לאומי|leumi/i, { text: "L", bg: "#1F57A3", domain: "leumi.co.il" }],
  [/מכבי|maccabi/i, { text: "M", bg: "#00539B", domain: "maccabi4u.co.il" }],
  [/ביטוח חקלאי/i, { text: "BH", bg: "#2E7D32", domain: "bth.co.il" }],
  [/revolut/i, { icon: "revolut" }],
  [/paypal/i, { icon: "paypal" }],
];

export type MerchantMark =
  | { kind: "icon"; path: string; bg: string; fg: string; title: string }
  | { kind: "badge"; text: string; bg: string; fg: string; logoUrl: string | null };

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
    out = {
      kind: "badge",
      text: mark.text,
      bg: mark.bg,
      fg: mark.fg ?? contrastOn(mark.bg),
      // The site's own icon at up to 128px; MerchantIcon keeps it only when it's sharp.
      logoUrl: mark.domain ? `https://www.google.com/s2/favicons?domain=${mark.domain}&sz=128` : null,
    };
  }
  cache.set(text, out);
  return out;
}
