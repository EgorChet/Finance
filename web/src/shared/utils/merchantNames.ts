import { displayLocale } from "@core/utils/displayLocale";
import { RU_MERCHANT_NAMES } from "./merchantNamesRu";

/**
 * English names for merchants that only have a Hebrew name — chains by their usual English name,
 * small places transliterated. Used wherever a charge is shown, and offered in Review as the
 * English name so one tap saves it for good. First match wins (specific before general).
 */
const NAMES: [RegExp, string][] = [
  // Chains & brands
  [/טיב טעם אונליין/, "Tiv Taam Online"],
  [/טיב טעם/, "Tiv Taam"],
  [/סופר ?פארם אונליין/, "Super-Pharm Online"],
  [/סופר ?פארם/, "Super-Pharm"],
  [/גוד פארם/, "Good Pharm"],
  [/בי דראגסטורס/, "B Drugstores"],
  [/בנדיקט/, "Benedict"],
  [/רולדין/, "Roladin"],
  [/ארומה/, "Aroma"],
  [/קפה קפה/, "Cafe Cafe"],
  [/לנדוור/, "Landwer Cafe"],
  [/אילנס/, "Ilan's Coffee"],
  [/ביסקוטי/, "Biscotti"],
  [/מייזון קייזר/, "Maison Kayser"],
  [/לה פרינה/, "La Farina"],
  [/אופרה/, "Opera Pâtisserie"],
  [/מקדונלד|מקודנלד/, "McDonald's"],
  [/שניצל קומפני/, "Schnitzel Company"],
  [/חומוס אליהו/, "Hummus Eliyahu"],
  [/חומוס בן עטר/, "Hummus Ben Atar"],
  [/סביח פרישמן/, "Sabich Frishman"],
  [/שופרסל/, "Shufersal"],
  [/חינם פלוס/, "Hinam Plus"],
  [/חיימוביץ/, "Haimovich Supershuk"],
  [/CARREFOUR|קרפור/i, "Carrefour"],
  [/איקאה/, "IKEA"],
  [/זארה/, "Zara"],
  [/נייקי/, "Nike"],
  [/אאוטלט פקטורי 54/, "Factory 54 Outlet"],
  [/המשביר/, "HaMashbir"],
  [/KSP/i, "KSP"],
  [/אייס/, "ACE"],
  [/פט פלנט/, "Pet Planet"],
  [/אופטיקל סנטר/, "Optical Center"],
  [/היינמן/, "JR Duty Free"],
  [/מובילנד/, "Movieland Cinemas"],
  [/עולם הקולנוע/, "Cinema World"],
  [/סיטי וואש/, "City Wash Express"],
  [/רנט א.?.?קאר הרץ|הרץ/, "Hertz Car Rental"],
  [/קופל/, "Kopel Group"],
  [/רכבת ישראל/, "Israel Railways"],
  [/כביש 6/, "Highway 6 (toll)"],
  [/פנגו/, "Pango"],
  [/^גו טו/, "GoTo (car sharing)"],
  [/אי\.? ?וי\.? ?אדג/, "EV Edge (charging)"],
  [/חשמל נטו/, "Hashmal Neto"],
  [/דלק/, "Delek"],
  // Bills, city, government, money
  [/בזק/, "Bezeq"],
  [/הוט מובייל|HOT mobile/i, "HOT Mobile"],
  [/חברת החשמל/, "Israel Electric (IEC)"],
  [/סופרגז/, "Supergas"],
  [/מי נתניה/, "Mei Netanya (water)"],
  [/עיריית נתניה-חניה/, "Netanya Municipality · parking"],
  [/עיריית נתניה/, "Netanya Municipality (arnona)"],
  [/ועד הבית/, "Vaad Bayit (building fee)"],
  [/משרד התחבורה/, "Ministry of Transport"],
  [/משרד הפנים/, "Ministry of Interior"],
  [/משרד החקלאות/, "Ministry of Agriculture · vet services"],
  [/מרכז לגביית קנסות/, "Fines Collection Center"],
  [/לשכה וטרינרית/, "Municipal vet office"],
  [/ביטוח חקלאי/, "Bituach Haklai (insurance)"],
  [/קרן מכבי|מכבי/, "Maccabi Health Fund"],
  [/סיבוס/, "Cibus (Pluxee)"],
  [/לאומי בונוס/, "Leumi Bonus"],
  [/העברה ב ?BIT/i, "BIT transfer"],
  [/ריבית/, "Interest"],
  [/דמי כרטיס/, "Card fee"],
  // Local places (transliterated)
  [/דני בתי מאפה/, "Dani Bakery"],
  [/מרכולית אגמים/, "Agamim Minimarket"],
  [/ממתקים אגמים/, "Agamim Sweets"],
  [/רונן בשרים/, "Ronen Meats"],
  [/גינגר בריאות/, "Ginger Health Food"],
  [/מסעדת תל יצחק|תל יצחק/, "Tel Yitzhak Restaurant"],
  [/חוף פולג מסעדה/, "Poleg Beach Restaurant"],
  [/משק השרון/, "Meshek HaSharon"],
  [/רקפת/, "Rakefet"],
  [/טריו מרקט/, "Trio Market"],
  [/גו מרקט/, "Go Market"],
  [/מרקט vip/i, "Market VIP"],
  [/מינימרקט/, "Minimarket"],
  [/ממ סופר רשפון/, "MM Super Rishpon"],
  [/בקס חנות חיות/, "Bex Pet Shop"],
  [/פינת החי מרפאה/, "Pinat HaHai Vet Clinic"],
  [/חיסוני כלבים/, "Dog vaccinations"],
  [/גג לחיות/, "Gag LaHayot (animal shelter)"],
  [/שופיפט|מזון לבעלי חיים/, "Pet food"],
  [/נאייקס|מכונות אוטומטיות/, "Vending machine"],
  [/דנדי רשפון/, "Dandy Rishpon"],
  [/ברטה/, "Berta"],
  [/המדריך/, "HaMadrich"],
  [/פוליצר/, "Pulitzer"],
  [/מלך הנרגילות/, "Hookah King"],
  [/אלוף הנרגילה/, "Hookah Champion"],
  [/קפה גן עד/, "Cafe Gan Eden"],
  [/בייקרי אודים/, "Bakery Udim"],
  [/בייקרי צינה/, "Bakery Tzina"],
  [/מאפיית סאלי/, "Sally's Bakery"],
  [/מאפה נאמן/, "Neeman Bakery"],
  [/לחם ארטיזן/, "Artisan Bread"],
  [/לחם עושר/, "Lechem Osher"],
  [/לה מולאן דורה/, "Le Moulin d'Or"],
  [/קסטה/, "Casta"],
  [/נונומימי/, "Nonomimi"],
  [/רייבו פיטנס/, "Reibo Fitness"],
  [/דוכן כשר טרמינל/, "Kosher stand · airport"],
  [/גוסטו/, "Gusto"],
  [/בראנץ' קייטרינג/, "Branch Catering"],
  [/רעננה סיטי/, "Raanana City"],
  [/רכבל ראש הנקרה|נקרות רכבל/, "Rosh HaNikra cable car"],
  [/הפיצפוציה/, "HaPitzputzia"],
  [/קליית חממה/, "Hamama Roastery"],
  [/חנות נוחות|רשת חנויות נוחות/, "Convenience store"],
  [/גרין גרופ/, "Green Group"],
  [/מנצ'ס/, "Munch's"],
  [/פוטו רויאל/, "Photo Royal"],
  [/גלידריית לומייר/, "Lumière Ice Cream"],
  [/חניון|חניונים/, "Parking"],
  [/מרכז רוגובין/, "Rogovin Center"],
  [/דרינק סנטר/, "Drink Center"],
  [/עמי מרכזים מסחריים/, "Ami Shopping Centers"],
  [/חצר הבירה/, "Hatzer HaBira"],
  [/רגע מתוק/, "Rega Matok"],
  [/קינג קונג/, "King Kong"],
  [/ברוקלין קינג/, "Brooklyn King"],
  [/עמדת מפתח/, "Key cutting"],
  [/קוקו נקו/, "Coco Neko"],
  [/דלאל/, "Dallal"],
  [/היבואן/, "HaYevuan"],
  [/ז'?לינסקי/, "Zelinsky & Rozen"],
  [/צומת הגומא/, "Tzomet HaGoma"],
  [/תירס בוטיק/, "Tiras Boutique (fruit & veg)"],
  [/האגם הקסום/, "The Magic Lake"],
  [/צמיגי מלי/, "Mali Tires & Garage"],
  [/מקס פולג/, "Max Poleg"],
  [/הרמיטאג'/, "Hermitage"],
  [/ביירן מרקט/, "Bayern Market"],
  [/פוזה/, "Poza"],
  [/נחת בכיכר/, "Nachat BaKikar"],
  [/קיוסק/, "Kiosk"],
  [/אצל אמיר/, "Etzel Amir"],
  [/רוז יין/, "Rose Wine & Drinks"],
  [/מכמורת/, "Michmoret"],
  [/קפה חן/, "Cafe Chen"],
  [/סופר טוסט/, "Super Toast"],
  [/קפה מרקט/, "Cafe Market"],
  [/קפה בראון/, "Cafe Brown"],
  [/פינת המפגש/, "Pinat HaMifgash"],
  [/פארק אריאל שרון/, "Ariel Sharon Park"],
  [/פרצל/, "Pretzel"],
  [/חדר אוכל/, "Cafeteria"],
  [/\bCOS\b/, "COS"],
  [/LAZUZ|לזוז/i, "Lazuz (sports courts)"],
  [/REDHOT/i, "RedHot"],
  [/אירוהנדלינג|AEROHANDLING/i, "Aerohandling"],
  [/פרחים לנשמה/, "Flowers for the Soul"],
  [/פארק רעננה/, "Raanana Park"],
  [/^נומי/, "Nomi"],
  [/אילי קפה/, "Ili Cafe"],
  [/קוקו/, "Coco"],
  [/השוק של שופי/, "Shoffy's Market"],
  [/עברי בפארק/, "Ivri BaPark"],
  [/טאטי/, "Tati"],
  [/פינה לב המושבה/, "Pina Lev HaMoshava"],
  [/אילונה שוורץ/, "Ilona Schwartz"],
  [/אלירן גולסטניפר/, "Eliran Golstnifer"],
  [/הדר ניהול בתי קפה/, "Hadar Cafe Management"],
  [/הלנה בנמל/, "Helena (Caesarea port)"],
  [/צאנג בה/, "Chang Ba"],
  [/קניונית על הדרך/, "Kenyonit Al HaDerech"],
  [/רבקה - קיסריה/, "Rivka (Caesarea)"],
];

/**
 * One name per brand, whatever the statement wrote (branch, legal name, payment code, capitals):
 * "ארקפה ביג גלילות", "ARCAFFE RAANANA" → "Arcaffe". Tested on "merchant_he merchant_en".
 */
const CANONICAL: [RegExp, string][] = [
  // Named by Egor
  [/גוסטו|goosto/i, "Gusto (hookah store)"],
  [/דנאל אי וי|zeekr/i, "Zeekr (Danel EV)"],
  [/אילונה שוורץ|chaplin/i, "Chaplin Grooming (dog grooming)"],
  [/משק השרון/, "Meshek HaSharon 26"],
  [/תל יצחק/, "Tel Yitzhak Bakery"],
  [/deli vino|דלי וינו/i, "Deli Vino"],
  [/skims/i, "SKIMS"],
  [/משרד התחבורה/, "Ministry of Transport"],
  // Saved under an odd label ("Super Agamim (Belarus)"); מרכולית = minimarket.
  [/מרכולית אגמים/, "Agamim Minimarket"],
  [/arcaffe|ארקפה/i, "Arcaffe"],
  [/\baroma\b|ארומה/i, "Aroma"],
  [/roladin|רולדין/i, "Roladin"],
  [/benedict|בנדיקט/i, "Benedict"],
  [/jorno|ג'ורנו/i, "Jorno Bakery"],
  [/landwer|לנדוור/i, "Landwer Cafe"],
  [/super-?pharm|סופר ?פארם(?! אונליין)/i, "Super-Pharm"],
  [/good ?pharm|גוד פארם/i, "Good Pharm"],
  [/tiv ?taam|טיב טעם(?! אונליין)/i, "Tiv Taam"],
  [/apple\.com|^apple\b/i, "Apple"],
  [/openai|chatgpt/i, "ChatGPT (OpenAI)"],
  [/anthropic/i, "Claude (Anthropic)"],
  [/cursor/i, "Cursor"],
  [/netflix/i, "Netflix"],
  [/iherb/i, "iHerb"],
  [/midjourney/i, "Midjourney"],
  [/render\.com/i, "Render"],
  [/\baws\b/i, "AWS"],
  [/yango/i, "Yango"],
  [/\bgett\b/i, "Gett"],
  [/paybox/i, "PayBox"],
  [/temu/i, "Temu"],
  [/aliexpress/i, "AliExpress"],
  [/booking\.c/i, "Booking.com"],
  [/\bpaul\b/i, "PAUL"],
  [/\blidl\b/i, "Lidl"],
  [/\bel al\b/i, "El Al"],
  [/airalo/i, "Airalo (eSIM)"],
  [/farfetch/i, "Farfetch"],
  [/rossignol/i, "Rossignol"],
  [/drivalia/i, "Drivalia (car rental)"],
  [/freeletics/i, "Freeletics"],
  [/duet pro/i, "Duet Pro"],
  [/bandcamp/i, "Bandcamp"],
  [/concertplace/i, "ConcertPlace"],
  [/rentalcars/i, "Rentalcars.com"],
  [/yollacalls/i, "Yolla Calls"],
  [/show4me/i, "Show4me"],
  [/myprotein/i, "Myprotein"],
  [/lagarder/i, "Lagardère Travel Retail"],
  [/\bitx\b/i, "Inditex (Zara group)"],
  [/oysho/i, "Oysho"],
  [/happicerie/i, "Happicerie"],
  [/benjamins bakery/i, "Benjamin's Bakery"],
  [/avo cafe/i, "Avo Cafe"],
  [/spareeat/i, "SpareEat"],
  [/restorant levant/i, "Restaurant Levant"],
  [/magazin alkohol/i, "Liquor store"],
  [/duty free market/i, "Duty Free Market"],
  [/hotel & resorts hmc/i, "HMC Hotels & Resorts"],
  [/bulgarian embassy/i, "Bulgarian Embassy"],
  [/burgas pharma/i, "Burgas Pharma"],
  [/farma vita/i, "Farma Vita"],
  [/emerald hospitality/i, "Emerald Hospitality"],
  [/amrest kofi/i, "AmRest Coffee"],
  [/cafe mikva/i, "Cafe Mikva"],
  [/pate&pufe/i, "Pate & Pufe Lounge"],
  // Latin names that come out of the Hebrew statement reversed
  [/ihsus eniw/i, "Wine Sushi"],
  [/yrrebeniw/i, "Wineberry"],
  [/tekram doof/i, "Food Market"],
];

/** Words kept in capitals when tidying an ALL-CAPS name. */
const KEEP_CAPS = new Set(["BIT", "KFC", "AWS", "COS", "KSP", "HOT", "BBQ", "TV", "USA", "UK", "EU", "IKEA"]);

/** "GO MOBILE" → "Go Mobile", "DELI VINO EOOD" → "Deli Vino", "SHOW4ME COM" → "Show4me". */
function tidyLatin(name: string): string {
  let n = name.replace(/\s+(EOOD|OOD|LTD\.?|INC\.?|LLC|SAS|GMBH|B\.?V\.?|PVT)\b\.?/gi, "").replace(/^[A-Z]{2,4}\*/, "").trim();
  const allCaps = n === n.toUpperCase() && /[A-Z]{3}/.test(n);
  const allLower = n === n.toLowerCase() && /[a-z]{3}/.test(n) && !/\.(com|net|io)\b/.test(n);
  if (allCaps || allLower) {
    n = n
      .toLowerCase()
      .split(/\s+/)
      .map((w) => (KEEP_CAPS.has(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(" ");
  }
  return n || name;
}

/** The brand's one name when we recognise it (chains, subscriptions, known places), else null. */
export function canonicalMerchantName(merchantHe: string | null | undefined, merchantEn?: string | null): string | null {
  const text = `${merchantHe ?? ""} ${merchantEn ?? ""}`;
  return CANONICAL.find(([re]) => re.test(text))?.[1] ?? null;
}

const HEBREW_RE = /[֐-׿]/;
const cache = new Map<string, string | null>();

/** English name for a Hebrew-only merchant, or null when we don't know one. */
export function knownMerchantName(merchantHe: string | null | undefined): string | null {
  const he = (merchantHe ?? "").trim();
  if (!he || !HEBREW_RE.test(he)) return null;
  const hit = cache.get(he);
  if (hit !== undefined) return hit;
  const name = NAMES.find(([re]) => re.test(he))?.[1] ?? null;
  cache.set(he, name);
  return name;
}

/**
 * The name to show for a charge — the same for every branch and spelling of a brand:
 * a canonical brand name, else its English name (tidied), else a known translation, else the
 * Hebrew. A Latin-only statement name is tidied too ("GO MOBILE" → "Go Mobile").
 */
export function englishMerchantName(tx: { merchant_he: string; merchant_en?: string | null }): string {
  const canonical = canonicalMerchantName(tx.merchant_he, tx.merchant_en);
  if (canonical) return canonical;
  const en = tx.merchant_en?.trim();
  if (en && !HEBREW_RE.test(en)) return tidyLatin(en);
  const known = knownMerchantName(tx.merchant_he);
  if (known) return known;
  if (!HEBREW_RE.test(tx.merchant_he)) return tidyLatin(tx.merchant_he.trim());
  return en || tx.merchant_he;
}

/** The name to show in the chosen language (Russian forms for local places; brands keep theirs). */
export function merchantDisplayName(tx: { merchant_he: string; merchant_en?: string | null }): string {
  const en = englishMerchantName(tx);
  if (displayLocale() !== "ru") return en;
  return RU_MERCHANT_NAMES[en] ?? en;
}

/** English name to offer in Review: canonical / known / tidied Latin, or "" when we'd be guessing. */
export function suggestedEnglishName(merchantHe: string, merchantEn?: string | null): string {
  const name = englishMerchantName({ merchant_he: merchantHe, merchant_en: merchantEn });
  return HEBREW_RE.test(name) ? "" : name;
}
