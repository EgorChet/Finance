from __future__ import annotations

import json
from pathlib import Path

from maps import DEFAULT_DATA_DIR, MapperStore, looks_hebrew, suggest_merchant_english
from models import Transaction
from translator import translate_merchant_hebrew

REVIEW_PATH = DEFAULT_DATA_DIR / "review_progress.json"


def transaction_key(tx: Transaction) -> str:
    return f"{tx.date.isoformat()}|{tx.merchant_he}|{tx.charge_amount:.2f}"


def effective_merchant_english(tx: Transaction, mapper: MapperStore) -> str:
    """Saved or inferred English name — never returns Hebrew."""
    rule = mapper.get_rule(tx.merchant_he)
    if rule and rule.english and not looks_hebrew(rule.english):
        return rule.english.strip()
    en = (tx.merchant_en or "").strip()
    if en and en != tx.merchant_he.strip() and not looks_hebrew(en):
        return en
    suggested = suggest_merchant_english(tx.merchant_he)
    if suggested:
        return suggested
    return ""


def review_display_english(
    tx: Transaction,
    mapper: MapperStore,
    *,
    auto_translate: bool = False,
) -> str:
    """English label for Review UI — rules, hints, then optional auto-translate."""
    english = effective_merchant_english(tx, mapper)
    if english:
        return english
    if auto_translate:
        translated = translate_merchant_hebrew(tx.merchant_he).strip()
        if translated and not looks_hebrew(translated) and translated != tx.merchant_he.strip():
            return translated
    return ""


def needs_review(tx: Transaction, mapper: MapperStore) -> bool:
    """Skip only places you already saved in merchant rules."""
    rule = mapper.get_rule(tx.merchant_he)
    if rule and rule.english and not looks_hebrew(rule.english) and rule.category:
        return False
    return True


def _review_priority(tx: Transaction, mapper: MapperStore) -> tuple:
    rule = mapper.get_rule(tx.merchant_he)
    has_full_rule = bool(rule and rule.english and rule.category)
    english = effective_merchant_english(tx, mapper)
    unknown_en = (
        not english.strip()
        or looks_hebrew(english)
        or english.strip() == tx.merchant_he.strip()
    )
    return (has_full_rule, not unknown_en, tx.date.toordinal())


class ReviewProgress:
    def __init__(self, path: Path = REVIEW_PATH):
        self.path = path
        self._reviewed: set[str] = set()
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            return
        with self.path.open(encoding="utf-8") as f:
            data = json.load(f)
        self._reviewed = set(data.get("reviewed_transactions", []))

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("w", encoding="utf-8") as f:
            json.dump(
                {"reviewed_transactions": sorted(self._reviewed)},
                f,
                ensure_ascii=False,
                indent=2,
            )

    def is_reviewed(self, key: str) -> bool:
        return key in self._reviewed

    def mark_reviewed(self, key: str) -> None:
        self._reviewed.add(key)
        self._save()

    def mark_merchant_reviewed(self, transactions: list[Transaction], merchant_he: str) -> int:
        count = 0
        for tx in transactions:
            if tx.merchant_he != merchant_he:
                continue
            key = transaction_key(tx)
            if key not in self._reviewed:
                self._reviewed.add(key)
                count += 1
        if count:
            self._save()
        return count

    def reviewed_count(self) -> int:
        return len(self._reviewed)

    def clear(self) -> None:
        self._reviewed.clear()
        if self.path.exists():
            self.path.unlink(missing_ok=True)


def count_auto_skipped(transactions: list[Transaction], mapper: MapperStore) -> int:
    return sum(1 for tx in transactions if not needs_review(tx, mapper))


def build_review_queue(
    transactions: list[Transaction],
    progress: ReviewProgress,
    mapper: MapperStore,
    *,
    skipped_keys: set[str],
    include_reviewed: bool = False,
    include_labeled: bool = False,
    one_per_merchant: bool = True,
) -> list[Transaction]:
    queue: list[Transaction] = []
    for tx in transactions:
        key = transaction_key(tx)
        if not include_reviewed and progress.is_reviewed(key):
            continue
        if key in skipped_keys:
            continue
        if not include_labeled and not needs_review(tx, mapper):
            continue
        queue.append(tx)
    queue.sort(key=lambda tx: _review_priority(tx, mapper))

    if one_per_merchant:
        seen: set[str] = set()
        deduped: list[Transaction] = []
        for tx in queue:
            if tx.merchant_he in seen:
                continue
            seen.add(tx.merchant_he)
            deduped.append(tx)
        queue = deduped

    return queue


def merchant_occurrence_count(transactions: list[Transaction], merchant_he: str) -> int:
    return sum(1 for tx in transactions if tx.merchant_he == merchant_he)
