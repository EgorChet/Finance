from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from categorize import CUSTOM_SPENDING_CATEGORIES, classify_food_spending, classify_merchant

DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
RULES_PATH = DEFAULT_DATA_DIR / "merchant_rules.json"

CATEGORY_MAP: dict[str, str] = {
    "אופנה": "Clothes",
    "אנרגיה": "Miscellaneous",
    "ביטוח ופיננסים": "Miscellaneous",
    "טיפוח ויופי": "Beauty & Personal Care",
    "מוסדות": "Government & Institutions",
    "מזון ומשקאות": "Eating out",
    "מזון מהיר": "Eating out",
    "מסעדות": "Eating out",
    "פנאי בילוי": "Leisure & Entertainment",
    "ריהוט ובית": "Home & Furniture",
    "רכב ותחבורה": "Transport",
    "רפואה ובריאות": "Health & Medical",
    "שונות": "Miscellaneous",
    "תקשורת ומחשבים": "Electronics & computers",
    "תיירות": "Tourism",
    "ילדים": "Kids",
    "מלונאות ואירוח": "Tourism",
}

_HEBREW_RE = re.compile(r"[\u0590-\u05FF]")

# Default English names for well-known chains (no saved rule yet).
_MERCHANT_ENGLISH_HINTS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"ארקפה\s*פולג", re.IGNORECASE), "Arcaffe Polg"),
    # Bank often mislabels Zara at Big Fashion Galilot as "ארקפה ביג גלילות"
    (re.compile(r"ארקפה\s*ביג\s*גלילות", re.IGNORECASE), "Zara Big Fashion Galilot"),
    (re.compile(r"ארקפה\s*מעוז\s*אביב", re.IGNORECASE), "Arcaffe Maoz Aviv"),
    (re.compile(r"ארקפה\s*רעננה", re.IGNORECASE), "Arcaffe Raanana"),
    (re.compile(r"ארקפה", re.IGNORECASE), "Arcaffe"),
]


def looks_hebrew(text: str) -> bool:
    return bool(_HEBREW_RE.search(text))


def suggest_merchant_english(hebrew: str) -> str | None:
    text = hebrew.strip()
    if not text:
        return None
    for pattern, english in _MERCHANT_ENGLISH_HINTS:
        if pattern.search(text):
            return english
    return None


@dataclass
class MerchantRule:
    english: str = ""
    category: str | None = None


def all_category_options(*extra: str) -> list[str]:
    names = set(CATEGORY_MAP.values()) | set(CUSTOM_SPENDING_CATEGORIES)
    for value in extra:
        text = str(value).strip()
        if text and text.lower() != "nan":
            names.add(text)
    return sorted(names)


def bank_category(category_he: str | None) -> str:
    if not category_he:
        return "Uncategorized"
    english = CATEGORY_MAP.get(category_he)
    if english:
        return english
    if _HEBREW_RE.search(category_he):
        return "Other"
    return category_he


def _load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def _save_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _parse_rule(raw) -> MerchantRule:
    if isinstance(raw, str):
        return MerchantRule(english=raw.strip())
    if isinstance(raw, dict):
        return MerchantRule(
            english=str(raw.get("english", "")).strip(),
            category=str(raw["category"]).strip() if raw.get("category") else None,
        )
    return MerchantRule()


def _rule_to_dict(rule: MerchantRule) -> dict:
    payload: dict[str, str] = {}
    if rule.english:
        payload["english"] = rule.english
    if rule.category:
        payload["category"] = rule.category
    return payload


def can_persist_locally(path: Path | None = None) -> bool:
    target = path or RULES_PATH
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        probe = target.parent / ".write_probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        return True
    except OSError:
        return False


class MapperStore:
    """Merchant name + category overrides keyed by Hebrew place name."""

    def __init__(
        self,
        data_dir: Path = DEFAULT_DATA_DIR,
        *,
        session_overrides: dict[str, dict] | None = None,
    ):
        self.data_dir = data_dir
        self.rules_path = data_dir / "merchant_rules.json"
        self._legacy_map_path = data_dir / "merchant_map.json"
        self._session_overrides = dict(session_overrides or {})
        self.user_rules: dict[str, MerchantRule] = {}
        self._reload()

    def _migrate_legacy_file(self, rules: dict[str, MerchantRule]) -> dict[str, MerchantRule]:
        legacy_path = self._legacy_map_path
        if not legacy_path.exists():
            return rules
        for hebrew, english in _load_json(legacy_path).items():
            if hebrew not in rules and isinstance(english, str) and english.strip():
                rules[hebrew] = MerchantRule(english=english.strip())
        if can_persist_locally(self.rules_path):
            _save_json(
                self.rules_path,
                {h: _rule_to_dict(r) for h, r in sorted(rules.items()) if _rule_to_dict(r)},
            )
            legacy_path.unlink(missing_ok=True)
        return rules

    def _reload(self) -> None:
        rules: dict[str, MerchantRule] = {}
        for hebrew, raw in _load_json(self.rules_path).items():
            rule = _parse_rule(raw)
            if rule.english or rule.category:
                rules[hebrew] = rule
        rules = self._migrate_legacy_file(rules)
        for hebrew, raw in self._session_overrides.items():
            existing = rules.get(hebrew, MerchantRule())
            patch = _parse_rule(raw)
            rules[hebrew] = MerchantRule(
                english=patch.english or existing.english,
                category=patch.category if patch.category is not None else existing.category,
            )
        self.user_rules = rules

    def get_rule(self, hebrew: str) -> MerchantRule | None:
        return self.user_rules.get(hebrew)

    def resolve_merchant(self, hebrew: str) -> tuple[str | None, bool]:
        user = self.user_rules.get(hebrew)
        if user and user.english:
            return user.english, True
        return None, False

    def resolve_category(
        self,
        hebrew: str,
        category_he: str | None,
        merchant_en: str = "",
    ) -> str:
        user = self.user_rules.get(hebrew)
        if user and user.category:
            return user.category
        food = classify_food_spending(hebrew, merchant_en, category_he)
        if food:
            return food
        merchant_cat = classify_merchant(hebrew, merchant_en, category_he)
        if merchant_cat:
            return merchant_cat
        return bank_category(category_he)

    def set_rule(
        self,
        hebrew: str,
        *,
        english: str | None = None,
        category: str | None = None,
    ) -> bool:
        hebrew = hebrew.strip()
        if not hebrew:
            return False

        current = self.user_rules.get(hebrew, MerchantRule())
        new_english = current.english if english is None else english.strip()
        new_category = current.category if category is None else (category.strip() or None)

        if not new_english and not new_category:
            return False

        updated = MerchantRule(english=new_english, category=new_category)
        self.user_rules[hebrew] = updated
        self._session_overrides[hebrew] = _rule_to_dict(updated)
        return self._persist_user_rules()

    def _persist_user_rules(self) -> bool:
        if not can_persist_locally(self.rules_path):
            return False
        payload = {
            hebrew: _rule_to_dict(rule)
            for hebrew, rule in sorted(self.user_rules.items())
            if _rule_to_dict(rule)
        }
        _save_json(self.rules_path, payload)
        return True

    def get_user_rules_export(self) -> dict[str, dict]:
        return {hebrew: _rule_to_dict(rule) for hebrew, rule in sorted(self.user_rules.items())}

    def merge_user_rules(self, data: dict) -> bool:
        for hebrew, raw in data.items():
            hebrew = hebrew.strip()
            if not hebrew:
                continue
            patch = _parse_rule(raw)
            current = self.user_rules.get(hebrew, MerchantRule())
            self.user_rules[hebrew] = MerchantRule(
                english=patch.english or current.english,
                category=patch.category if patch.category is not None else current.category,
            )
        self._session_overrides = {
            hebrew: _rule_to_dict(rule) for hebrew, rule in self.user_rules.items()
        }
        return self._persist_user_rules()

    @property
    def persists_to_disk(self) -> bool:
        return can_persist_locally(self.rules_path)

