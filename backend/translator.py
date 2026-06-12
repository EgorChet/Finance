from __future__ import annotations

import re

from maps import MapperStore, looks_hebrew, suggest_merchant_english
from categorize import SUBSCRIPTIONS, normalize_subscription_vendor
from models import Transaction


def translate_merchant_hebrew(text: str) -> str:
    """Best-effort Hebrew → English for display (e.g. Review cards)."""
    return _auto_translate(text)


def _auto_translate(text: str) -> str:
    try:
        from deep_translator import GoogleTranslator
    except ImportError:
        return text
    try:
        return GoogleTranslator(source="iw", target="en").translate(text)
    except Exception:
        return text


def translate_transactions(
    transactions: list[Transaction],
    mapper: MapperStore,
    *,
    auto_translate_unknown: bool = True,
) -> list[Transaction]:
    for tx in transactions:
        known_en, known = mapper.resolve_merchant(tx.merchant_he)
        if known_en:
            tx.merchant_en = known_en
            tx.merchant_known = True
        elif not looks_hebrew(tx.merchant_he):
            tx.merchant_en = tx.merchant_he
            tx.merchant_known = True
        elif (hint := suggest_merchant_english(tx.merchant_he)):
            tx.merchant_en = hint
            tx.merchant_known = True
        elif auto_translate_unknown:
            translated = _auto_translate(tx.merchant_he).strip()
            if translated and not looks_hebrew(translated) and translated != tx.merchant_he.strip():
                tx.merchant_en = translated
                tx.merchant_known = True
            else:
                tx.merchant_en = ""
                tx.merchant_known = False
        else:
            tx.merchant_en = ""
            tx.merchant_known = False

        tx.category_en = mapper.resolve_category(
            tx.merchant_he, tx.category_he, tx.merchant_en
        )
        if tx.category_en == SUBSCRIPTIONS and tx.merchant_en:
            tx.merchant_en = normalize_subscription_vendor(tx.merchant_en)

    return transactions
