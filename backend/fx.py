"""Foreign-currency → ILS for Leumi Visa exports.

When the bank provides column 3 (charge_amount in ILS), that value is always used.
Live FX rates are fetched only for pending charges with no bank ILS amount yet.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Optional

from fx_rates import get_rate_to_ils

_HEBREW = re.compile(r"[\u0590-\u05FF]")
_COUNTRY_SUFFIX = re.compile(r"\s([A-Z]{2})\s*$")
_USD_MERCHANT = re.compile(
    r"OPENAI|CURSOR|AWS\s|APPLE\.COM|MIDJOURNEY|AIRBNB|GOOGLE|GITHUB|MICROSOFT|"
    r"NETFLIX|SPOTIFY|TRIP\.COM|AIRALO|OMIO|BOUNCE|FILTERLY|SPECIALSCOMEDY|"
    r"yollacalls|CONCERTPLACE|BANDCAMP|economybookings|TradeInn|Farfetch|"
    r"HOTEL & RESORTS|DRIVALIA|SKIS ROSSIGNOL|EL AL \d",
    re.IGNORECASE,
)
_EUR_MERCHANT = re.compile(
    r"\b(SRL|SPA|OOD|EOOD|GMBH|TERMINI|ROMA|MILANO|AUTOGRILL|UBR\*|AVIS|ZARA|COS|"
    r"UNIQLO|POLENE|VIvat|PAUL AIRPORT|DEDEM SPA|PIERLUIGI|SUMUP|MANGO ROMA)\b",
    re.IGNORECASE,
)
_BGN_MERCHANT = re.compile(r"\b(EOOD|OOD|BALGARIYA|BURGAS|BULGARIA|AMREST KOFI)\b", re.IGNORECASE)


def _round_money(value: float) -> float:
    return round(value * 100) / 100


def _has_hebrew(text: str) -> bool:
    return bool(_HEBREW.search(text))


def infer_currency_from_ratio(amount: float, charge: float) -> Optional[str]:
    if amount <= 0 or charge <= 0:
        return None
    ratio = charge / amount
    if 3.2 <= ratio <= 4.05:
        return "USD"
    if 3.85 <= ratio <= 4.55:
        return "EUR"
    if 1.85 <= ratio <= 2.25:
        return "BGN"
    if 4.5 <= ratio <= 5.0:
        return "GBP"
    if 0.85 <= ratio <= 1.05:
        return "PLN"
    if 0.005 <= ratio <= 0.02:
        return "AMD"
    if 0.98 <= ratio <= 1.02:
        return "ILS"
    return None


def detect_currency(
    merchant: str,
    amount: float,
    charge: Optional[float],
    explicit_currency: Optional[str] = None,
) -> str:
    if explicit_currency and explicit_currency != "ILS":
        return explicit_currency

    if _has_hebrew(merchant):
        return "ILS"

    if charge is not None and charge > 0 and amount > 0:
        inferred = infer_currency_from_ratio(amount, charge)
        if inferred:
            return inferred

    if _USD_MERCHANT.search(merchant):
        return "USD"

    suffix = _COUNTRY_SUFFIX.search(merchant.strip())
    if suffix:
        cc = suffix.group(1)
        if cc == "US":
            return "USD"
        if cc == "PL":
            return "PLN"
        if cc in ("DE", "FR", "IT", "ES", "NL", "AT", "BE", "PT", "GR"):
            return "EUR"
        if cc == "GB":
            return "GBP"
        if cc == "BG":
            return "BGN"
        if cc == "AM":
            return "AMD"

    if _BGN_MERCHANT.search(merchant):
        return "BGN"
    if _EUR_MERCHANT.search(merchant):
        return "EUR"

    if re.search(r"[A-Za-z]{3,}", merchant) and not _has_hebrew(merchant):
        return "USD"

    return "ILS"


def is_pending_charge(charge_raw, notes: Optional[str]) -> bool:
    if notes and "בקליטה" in notes:
        return True
    if charge_raw is None:
        return True
    try:
        return float(charge_raw) <= 0
    except (TypeError, ValueError):
        return True


def resolve_charge_ils(
    amount: float,
    charge_raw,
    merchant: str,
    notes: Optional[str],
    tx_date: Optional[date] = None,
    explicit_currency: Optional[str] = None,
) -> tuple[float, Optional[str], bool]:
    """
    Return (charge_amount_ils, original_currency, estimated).
    Bank ILS charge (column 3) wins whenever present.
    """
    charge: Optional[float]
    if charge_raw is None:
        charge = None
    else:
        try:
            charge = float(charge_raw)
        except (TypeError, ValueError):
            charge = None

    if amount <= 0:
        return 0.0, None, False

    pending = is_pending_charge(charge_raw, notes)

    # Pending — column 3 not final; use FX even if charge_amount was already estimated.
    if pending:
        currency = (
            explicit_currency
            if explicit_currency and explicit_currency != "ILS"
            else detect_currency(merchant, amount, None, None)
        )
        if currency == "ILS":
            return _round_money(amount), "ILS", True
        rate_date = tx_date or date.today()
        rate = get_rate_to_ils(currency, rate_date)
        return _round_money(amount * rate), currency, True

    # Bank ILS charge — always trust column 3 when the bank charged in ILS.
    if charge is not None and charge > 0:
        currency = detect_currency(merchant, amount, charge, explicit_currency)
        if currency == "ILS" or abs(amount - charge) < 0.02:
            return _round_money(charge), "ILS" if abs(amount - charge) < 0.02 else currency, False
        return _round_money(charge), currency, False

    currency = detect_currency(merchant, amount, charge, explicit_currency)
    if currency == "ILS":
        return _round_money(amount), "ILS", False

    rate_date = tx_date or date.today()
    rate = get_rate_to_ils(currency, rate_date)
    return _round_money(amount * rate), currency, True
