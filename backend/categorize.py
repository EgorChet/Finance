from __future__ import annotations

import re

# Bank Hebrew categories that represent food spending we want to split.
FOOD_CATEGORY_HE = frozenset({"מסעדות", "מזון מהיר", "מזון ומשקאות"})

COFFEE = "Coffee"
EATING_OUT = "Eating out"
GROCERIES = "Groceries"
SUBSCRIPTIONS = "Subscriptions"
TRANSPORT = "Transport"
EDUCATION = "Education"
HOUSING = "Housing"
ELECTRONICS = "Electronics & computers"
CLOTHES = "Clothes"
BIT = "BIT"
NAILS = "Nails"
HOOKAH = "Hookah"
PETS = "Pets"
BANK_FEES = "Bank fees"

CUSTOM_SPENDING_CATEGORIES = (
    COFFEE,
    EATING_OUT,
    GROCERIES,
    SUBSCRIPTIONS,
    TRANSPORT,
    EDUCATION,
    HOUSING,
    ELECTRONICS,
    CLOTHES,
    BIT,
    NAILS,
    HOOKAH,
    PETS,
    BANK_FEES,
)

_COFFEE_RE = re.compile(
    r"|".join(
        [
            r"arcaff",
            r"ארקפה",
            r"\baroma\b",
            r"ארומה",
            r"avo\s*cafe",
            r"\bcafe\b",
            r"\bcoffee\b",
            r"קפה",
            r"benedict",
            r"בנדיקט",
            r"בייקרי",
            r"\bbakery\b",
            r"roladin",
            r"רולדין",
            r"espresso",
            r"אספרסר",
            r"roasting",
            r"קליית",
            r"maison\s*kaiser",
            r"קונדיטוריה",
            r"מאפייה",
            r"מאפה",
            r"jorno",
            r"dandy",
            r"דנדי",
            r"sunshine",
            r"סנשיין",
            r"nonomimi",
            r"נונומימי",
            r"garden\s*coffee",
            r"קפה\s*גן",
            r"גן\s*עד",
        ]
    ),
    re.IGNORECASE,
)

_HOME_COFFEE_SUPPLIES_RE = re.compile(
    r"|".join(
        [
            r"^coffee\s*shop$",
            r"חנות\s*קפה",
        ]
    ),
    re.IGNORECASE,
)

_HOOKAH_RE = re.compile(
    r"|".join(
        [
            r"\bgusto\b",
            r"גוסטו",
            r"hookah",
            r"נרגילה",
            r"samora",
            r"סמורה",
            r"מלך\s*הנרגיל",
        ]
    ),
    re.IGNORECASE,
)

_RESTAURANT_RE = re.compile(
    r"|".join(
        [
            r"helena",
            r"הלנה\s*בנמל",
        ]
    ),
    re.IGNORECASE,
)

_SUSHI_RE = re.compile(
    r"|".join(
        [
            r"ihsus\s*eniw",
            r"sushi",
            r"סושי",
            r"japan",
            r"יפן",
        ]
    ),
    re.IGNORECASE,
)

_CLOTHES_RE = re.compile(
    r"|".join(
        [
            r"\bzara\b",
            r"זארה",
            r"ארקפה\s*ביג\s*גלילות",  # bank mislabel for Zara at Big Fashion Galilot
            r"\bnike\b",
            r"נייקי",
            r"calvin\s*klein",
            r"קלווין",
            r"\bskims\b",
            r"eng\s*sport",
            r"tradeinn",
            r"טריידינג",
            r"rossignol",
            r"רוסיניול",
            r"\bh\s*&\s*m\b",
            r"castro",
            r"קסטרו",
            r"\bfox\b",
            r"פוקס",
            r"american\s*eagle",
            r"מנגו",
            r"\bmango\b",
            r"pull\s*&\s*bear",
            r"massimo\s*dutti",
        ]
    ),
    re.IGNORECASE,
)

_SIBUS_RE = re.compile(
    r"|".join(
        [
            r"sibus\s*flexi",
            r"cibus\s*flexi",
            r"סיבוס",
            r"סיבוס\s*פלאקסי",
        ]
    ),
    re.IGNORECASE,
)

_WOLT_GROCERY_RE = re.compile(
    r"(?=.*\bwolt\b)(?=.*(?:tiv\s*taam|טיב\s*טעם))|"
    r"(?=.*וולט)(?=.*טיב\s*טעם)",
    re.IGNORECASE,
)

_GROCERY_RE = re.compile(
    r"|".join(
        [
            r"tiv\s*taam",
            r"טיב\s*טעם",
            r"shufersal",
            r"שופרסל",
            r"mercalit",
            r"מרכולית",
            r"go\s*market",
            r"גו\s*מרקט",
            r"chaimovitz",
            r"חיימוביץ",
            r"free\s*plus",
            r"חינם\s*פלוס",
            r"trio\s*market",
            r"טריו\s*מרקט",
            r"yochananof",
            r"יוחננוף",
            r"rami\s*levy",
            r"רמי\s*לוי",
            r"super\s*pharm",
            r"סופר\s*פארם",
            r"myprotein",
            r"iherb",
            r"aliexpress",
            r"importer",
            r"היבואן",
            r"ginger",
            r"גינגר",
            r"health\s*and\s*nature",
            r"leumi\s*bonus",
            r"לאומי\s*בונוס",
        ]
    ),
    re.IGNORECASE,
)

_SUBSCRIPTION_RE = re.compile(
    r"|".join(
        [
            r"\bcursor\b",
            r"apple\.com",
            r"\bnetflix\b",
            r"\bspotify\b",
            r"\bopenai\b",
            r"chatgpt",
            r"\bgithub\b",
            r"\badobe\b",
            r"microsoft\s*365",
            r"google\s*one",
            r"youtube\s*premium",
            r"\bdisney\+",
            r"prime\s*video",
            r"subscription",
            r"מנוי",
            r"\baws\b",
            r"amazon\s*web\s*services",
        ]
    ),
    re.IGNORECASE,
)

_HOME_INTERNET_RE = re.compile(
    r"|".join(
        [
            r"\bbezeq\b",
            r"בזק",
            r"partner\s*(?:communications|internet|fiber|fibers)",
            r"hot\s*(?:net|internet|fiber)",
            r"cellcom\s*(?:internet|fiber)",
            r"unlimited\s*fiber",
            r"סיבים",
            r"אינטרנט\s*בית",
        ]
    ),
    re.IGNORECASE,
)

_MOBILE_PHONE_RE = re.compile(
    r"|".join(
        [
            r"hot\s*mobile",
            r"הוט\s*מובייל",
            r"\bcellcom\b",
            r"סלקום",
            r"pelephone",
            r"פלאפון",
            r"\bgolan\b",
            r"גולן",
            r"partner\s*mobile",
            r"012\s*mobile",
            r"wecom",
            r"019\s*mobile",
            r"sim\s*card",
            r"סים\s*קארד",
        ]
    ),
    re.IGNORECASE,
)

_TRANSPORT_RE = re.compile(
    r"|".join(
        [
            r"movit",
            r"מוביט",
            r"rakevet|rekevet",
            r"רכבת",
            r"israel\s*railway",
            r"egged",
            r"אגד",
            r"אוטובוס",
            r"\bbus\b",
            r"metropoline",
            r"קווים",
            r"dan\s*bus",
            r"חקלאי",
            r"haklai",
            r"אלמנטר",
            r"elementor",
            r"רכב\s*חובה",
            r"mandatory\s*car",
            r"car\s*insurance",
            r"ביטוח.*רכב",
            r"city\s*wash",
            r"סיטי\s*וואש",
            r"car\s*wash",
            r"שטיפ",
            r"ev\s*edge",
            r"אי\.?\s*וי\.?\s*אדג",
            r"\bdrivalia\b",
            r"כביש\s*6",
            r"highway\s*6",
            r"\bparking\b",
            r"חניון",
            r"חניה",
            r"דלק",
            r"\bfuel\b",
            r"gas\s*station",
            r"תדלוק",
            r"tire",
            r"צמיג",
            r"מוסך",
            r"garage",
            r"koppel",
            r"קופל",
            r"מוסך\s*2001",
            r"צמיגי",
            r"חניונים",
            r"rent\s*a\s*car",
            r"השכרת\s*רכב",
            r"\bpango\b",
            r"פנגו",
            r"התחבורה",
            r"\bgett\b",
            r"yango\s*taxi",
            r"^yango$",
            r"\byango\b",
            r"\buber\b",
            r"\bbolt\b",
            r"\btaxi\b",
            r"מונית",
            r"go\s*to\b",
            r"הלוואת\s*רכב",
            r"car\s*loan",
        ]
    ),
    re.IGNORECASE,
)

_EDUCATION_RE = re.compile(
    r"|".join(
        [
            r"developers\s*institute",
            r"מכון\s*המפתחים",
        ]
    ),
    re.IGNORECASE,
)

_ELECTRICITY_GAS_RE = re.compile(
    r"|".join(
        [
            r"electric\s*company",
            r"חברת\s*חשמל",
            r"israel\s*electric",
            r"electricity",
            r"חשמל",
            r"אלקטרה",
            r"electra",
            r"supergas",
            r"סופרגז",
            r"פזגז",
            r"am:israel",
            r"gas\s*(?:bill|company)",
            r"millennium\s*line",
            r"net\s*electricity",
        ]
    ),
    re.IGNORECASE,
)

_HOUSING_RE = re.compile(
    r"|".join(
        [
            r"arnona",
            r"ארנונה",
            r"עיריית\s*נתניה(?!.*חניה)",
            r"vaad\s*bayit",
            r"vaad\s*habayit",
            r"ועד\s*ה?בית",
            r"לועד\s*הבית",
            r"תשלום\s*לועד",
            r"building\s*committee",
            r"house\s*committee",
            r"electric\s*company",
            r"חברת\s*חשמל",
            r"israel\s*electric",
            r"electra\s*power",
            r"supergas",
            r"סופרגז",
            r"פזגז",
            r"מי\s*נתניה",
            r"mi\s*netanya",
            r"\bbezeq\b",
            r"בזק",
        ]
    ),
    re.IGNORECASE,
)

_ELECTRONICS_RE = re.compile(
    r"|".join(
        [
            r"\bksp\b",
            r"go\s*mobile",
            r"גו\s*מובייל",
            r"bug\s*computers",
            r"באג",
            r"ivory",
            r"אייבורי",
            r"zap",
            r"זאפ",
            r"payngo",
            r"מחשבים",
        ]
    ),
    re.IGNORECASE,
)

_VAAD_BAYIT_RE = re.compile(
    r"|".join(
        [
            r"ועד\s*ה?בית",
            r"לועד\s*הבית",
            r"תשלום\s*לועד",
            r"vaad\s*bayit",
            r"vaad\s*habayit",
            r"building\s*committee",
            r"house\s*committee",
        ]
    ),
    re.IGNORECASE,
)

_BANK_FEES_RE = re.compile(
    r"|".join(
        [
            r"interest",
            r"ריבית",
            r"visa\s*card\s*fees",
            r"דמי\s*כרטיס",
            r"עמל",
        ]
    ),
    re.IGNORECASE,
)

_NAILS_RE = re.compile(
    r"|".join(
        [
            r"\bpaybox\b",
            r"פייבוקס",
        ]
    ),
    re.IGNORECASE,
)

_BIT_RE = re.compile(
    r"|".join(
        [
            r"^bit$",
            r"העברה\s*ב\s*bit",
            r"transfer\s*in\s*bit",
        ]
    ),
    re.IGNORECASE,
)

_P2P_RE = re.compile(
    r"|".join(
        [
            r"העברה",
            r"p2p",
        ]
    ),
    re.IGNORECASE,
)

_FITNESS_RE = re.compile(
    r"|".join(
        [
            r"fitness",
            r"\bgym\b",
            r"כושר",
            r"raybo",
            r"רייבו",
        ]
    ),
    re.IGNORECASE,
)

_PETS_RE = re.compile(
    r"|".join(
        [
            r"veterinar",
            r"וטרינר",
            r"vet\s*clinic",
            r"pet\s*shop",
            r"חנות\s*חיות",
            r"בע[\"׳']?\s*חיים",
            r"ilona\s*schwartz",
            r"אילונה\s*שוורץ",
            r"pet\s*groom",
            r"מספרה.*חיות",
            r"טיפוח.*חיות",
        ]
    ),
    re.IGNORECASE,
)


def _merchant_text(merchant_he: str, merchant_en: str) -> str:
    return f"{merchant_he} {merchant_en}".strip()


def normalize_subscription_vendor(name: str) -> str:
    """Short vendor label for subscription charges (Apple, Cursor, Netflix, …)."""
    n = name.strip()
    if not n:
        return n
    patterns = (
        (re.compile(r"apple", re.I), "Apple"),
        (re.compile(r"cursor", re.I), "Cursor"),
        (re.compile(r"netflix", re.I), "Netflix"),
        (re.compile(r"\baws\b", re.I), "AWS"),
        (re.compile(r"openai|chatgpt", re.I), "OpenAI"),
        (re.compile(r"spotify", re.I), "Spotify"),
        (re.compile(r"github", re.I), "GitHub"),
        (re.compile(r"google\s*one|youtube", re.I), "Google"),
        (re.compile(r"microsoft|office\s*365", re.I), "Microsoft"),
        (re.compile(r"adobe", re.I), "Adobe"),
        (re.compile(r"disney", re.I), "Disney"),
    )
    for pattern, label in patterns:
        if pattern.search(n):
            return label
    return n


def classify_food_spending(
    merchant_he: str,
    merchant_en: str,
    category_he: str | None,
) -> str | None:
    """
    Map food-related bank rows to Coffee, Eating out, or Groceries.
    Returns None if the bank category is not food-related.
    """
    text = _merchant_text(merchant_he, merchant_en)

    if _SIBUS_RE.search(text):
        return GROCERIES
    if _WOLT_GROCERY_RE.search(text) or (
        re.search(r"wolt|וולט", text, re.IGNORECASE) and _GROCERY_RE.search(text)
    ):
        return GROCERIES
    if re.search(r"leumi\s*bonus|לאומי\s*בונוס", text, re.IGNORECASE):
        return GROCERIES
    if _HOME_COFFEE_SUPPLIES_RE.search(text):
        return GROCERIES

    if not category_he or category_he not in FOOD_CATEGORY_HE:
        return None

    if _RESTAURANT_RE.search(text) or _SUSHI_RE.search(text):
        return EATING_OUT
    if _GROCERY_RE.search(text):
        return GROCERIES
    if _COFFEE_RE.search(text):
        return COFFEE
    return EATING_OUT


def classify_merchant(
    merchant_he: str,
    merchant_en: str,
    category_he: str | None,
) -> str | None:
    """
    Assign a practical spending category from merchant names.
    Runs after user rules and food splits; before the bank category fallback.
    """
    text = _merchant_text(merchant_he, merchant_en)

    if _BANK_FEES_RE.search(text):
        return BANK_FEES
    if _NAILS_RE.search(text):
        return NAILS
    if _HOOKAH_RE.search(text):
        return HOOKAH
    if _BIT_RE.search(text) or (
        merchant_he.strip().upper() == "BIT"
        or "העברה ב BIT" in merchant_he.upper()
    ):
        return BIT
    if _P2P_RE.search(text):
        return BIT
    if _HOUSING_RE.search(text):
        return HOUSING
    if _VAAD_BAYIT_RE.search(text):
        return HOUSING
    if _COFFEE_RE.search(text):
        return COFFEE
    if _SUSHI_RE.search(text):
        return EATING_OUT
    if _CLOTHES_RE.search(text):
        return CLOTHES
    if _SUBSCRIPTION_RE.search(text):
        return SUBSCRIPTIONS
    if _HOME_INTERNET_RE.search(text):
        return HOUSING
    if _MOBILE_PHONE_RE.search(text):
        return SUBSCRIPTIONS
    if _EDUCATION_RE.search(text):
        return EDUCATION
    if _TRANSPORT_RE.search(text):
        return TRANSPORT
    if _ELECTRICITY_GAS_RE.search(text):
        return HOUSING
    if _ELECTRONICS_RE.search(text):
        return ELECTRONICS
    if _FITNESS_RE.search(text):
        return SUBSCRIPTIONS
    if _PETS_RE.search(text):
        return PETS

    # Bank-category hints when the merchant name is generic.
    if category_he == "רכב ותחבורה":
        return TRANSPORT
    if category_he == "ביטוח ופיננסים" and re.search(
        r"רכב|חקלאי|אלמנטר|car", text, re.IGNORECASE
    ):
        return TRANSPORT
    if category_he == "תקשורת ומחשבים":
        return ELECTRONICS
    if category_he == "אופנה":
        return CLOTHES

    return None
