/**
 * Logos for merchants you pay often: merchant name → the brand's website, and the logo is the
 * site's icon (Google's public favicon service; only the domain is sent). Anything not listed,
 * or a logo that fails to load, falls back to the category emoji.
 * Patterns are tested against "merchant_he merchant_en". First match wins.
 */
const LOGOS: [RegExp, string][] = [
  // Coffee & bakeries
  [/arcaffe|ארקפה/i, "arcaffe.co.il"],
  [/aroma|ארומה/i, "aroma.co.il"],
  [/קפה קפה|cafe cafe/i, "cafecafe.co.il"],
  [/roladin|רולדין/i, "roladin.co.il"],
  [/benedict|בנדיקט/i, "benedict.co.il"],
  [/landwer|לנדוור/i, "landwer.co.il"],
  [/biscotti|ביסקוטי/i, "biscotti.co.il"],
  // Groceries & pharmacy
  [/tiv ?taam|טיב טעם/i, "tivtaam.co.il"],
  [/shufersal|שופרסל/i, "shufersal.co.il"],
  [/rami ?levy|רמי לוי/i, "rami-levy.co.il"],
  [/yochananof|יוחננוף/i, "yochananof.co.il"],
  [/victory|ויקטורי/i, "victoryonline.co.il"],
  [/super-?pharm|סופר פארם/i, "super-pharm.co.il"],
  [/good ?pharm|גוד פארם/i, "good-pharm.co.il"],
  [/iherb/i, "iherb.com"],
  // Home & shopping
  [/ikea|איקאה/i, "ikea.co.il"],
  [/zara|זארה/i, "zara.com"],
  [/nike|נייקי/i, "nike.com"],
  [/h&m|\bhm\b/i, "hm.com"],
  [/castro|קסטרו/i, "castro.com"],
  [/\bfox\b|פוקס/i, "fox.co.il"],
  [/temu/i, "temu.com"],
  [/shein/i, "shein.com"],
  [/aliexpress/i, "aliexpress.com"],
  [/amazon(?!.*aws)|amzn/i, "amazon.com"],
  // Subscriptions & tech
  [/apple\.com|apple/i, "apple.com"],
  [/openai|chatgpt/i, "openai.com"],
  [/anthropic|claude/i, "claude.ai"],
  [/cursor/i, "cursor.com"],
  [/\baws\b|amazon web services/i, "aws.amazon.com"],
  [/midjourney/i, "midjourney.com"],
  [/render\.com/i, "render.com"],
  [/netflix/i, "netflix.com"],
  [/spotify/i, "spotify.com"],
  [/google/i, "google.com"],
  [/youtube/i, "youtube.com"],
  [/disney/i, "disneyplus.com"],
  // Phone, internet, utilities, city
  [/hot mobile|הוט מובייל|^hot\b/i, "hot.net.il"],
  [/בזק|bezeq/i, "bezeq.co.il"],
  [/partner|פרטנר/i, "partner.co.il"],
  [/cellcom|סלקום/i, "cellcom.co.il"],
  [/חברת החשמל|israel electric/i, "iec.co.il"],
  [/סופרגז|supergas/i, "supergas.co.il"],
  [/אמישראגז|amisragas/i, "amisragas.co.il"],
  [/מי נתניה/i, "mei-netanya.co.il"],
  [/עיריית נתניה/i, "netanya.muni.il"],
  // Transport
  [/pango|פנגו/i, "pango.co.il"],
  [/moovit|מוביט/i, "moovitapp.com"],
  [/gett/i, "gett.com"],
  [/yango/i, "yango.com"],
  [/uber/i, "uber.com"],
  [/wolt/i, "wolt.com"],
  [/\bpaz\b|^פז /i, "paz.co.il"],
  [/delek|^דלק /i, "delek.co.il"],
  [/sonol|סונול/i, "sonol.co.il"],
  [/booking/i, "booking.com"],
  // Money, health, insurance
  [/paybox|פייבוקס/i, "payboxapp.com"],
  [/\bbit\b/i, "bitpay.co.il"],
  [/סיבוס|cibus|pluxee/i, "pluxee.co.il"],
  [/לאומי|leumi/i, "leumi.co.il"],
  [/מכבי|maccabi/i, "maccabi4u.co.il"],
  [/ביטוח חקלאי/i, "bth.co.il"],
  [/revolut/i, "revolut.com"],
  [/paypal/i, "paypal.com"],
];

const cache = new Map<string, string | null>();

/** Logo URL for a merchant, or null when there's no known brand. */
export function merchantLogoUrl(merchantHe: string | null | undefined, merchantEn?: string | null): string | null {
  const text = `${merchantHe ?? ""} ${merchantEn ?? ""}`.trim();
  if (!text) return null;
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  const domain = LOGOS.find(([re]) => re.test(text))?.[1] ?? null;
  const url = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null;
  cache.set(text, url);
  return url;
}
