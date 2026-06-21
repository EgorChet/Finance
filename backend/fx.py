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
_ILS_MERCHANT = re.compile(r"\bBIT\b", re.IGNORECASE)


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

    if _ILS_MERCHANT.search(merchant):
        return "ILS"

    suffix = _COUNTRY_SUFFIX.search(merchant.strip())
    if suffix and suffix.group(1) == "IL":
        return "ILS"

    if charge is not None and charge > 0 and amount > 0:
        inferred = infer_currency_from_ratio(amount, charge)
        if inferred:
            return inferred

    if _USD_MERCHANT.search(merchant):
        return "USD"

    if suffix:
        cc = suffix.group(1)
        if cc == "IL":
            return "ILS"
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


REFUND_TYPE_MARKERS = ("זיכוי", "השבת מכירה")
_INSTALLMENT = re.compile(r"תשלום\s+(\d+)\s+מתוך\s+(\d+)")
_BILLING_ADJUSTMENT = "שינוי מועד חיוב"
_CARD_FEE_TYPE = "דמי חבר"
_INTEREST_MERCHANT = "* ריבית *"


def parse_installment(notes: Optional[str]) -> Optional[tuple[int, int]]:
    if not notes:
        return None
    match = _INSTALLMENT.search(notes)
    if not match:
        return None
    return int(match.group(1)), int(match.group(2))


def should_skip_installment_row(
    charge_raw,
    notes: Optional[str],
    *,
    transaction_type_he: Optional[str] = None,
) -> bool:
    """Credit installments before the bank posts an ILS slice — skip, do not estimate the full amount."""
    installment = parse_installment(notes)
    if installment is None:
        return False
    current, _ = installment
    if current == 0:
        return True
    return is_pending_charge(
        charge_raw,
        notes,
        transaction_type_he=transaction_type_he,
    )


def is_billing_cycle_adjustment(merchant: str) -> bool:
    return _BILLING_ADJUSTMENT in merchant


def is_card_membership_fee(merchant: str, transaction_type_he: Optional[str] = None) -> bool:
    if transaction_type_he == _CARD_FEE_TYPE:
        return True
    return "דמי כרטיס" in merchant


def is_interest_row(merchant: str) -> bool:
    return _INTEREST_MERCHANT in merchant


def should_skip_non_spend_row(
    charge_raw,
    merchant: str,
    notes: Optional[str],
    *,
    transaction_type_he: Optional[str] = None,
) -> bool:
    """Rows that must not appear in spend totals or transaction lists."""
    if should_skip_installment_row(charge_raw, notes, transaction_type_he=transaction_type_he):
        return True
    if is_billing_cycle_adjustment(merchant):
        return True
    if is_card_membership_fee(merchant, transaction_type_he) and is_pending_charge(
        charge_raw,
        notes,
        transaction_type_he=transaction_type_he,
    ):
        return True
    return False


def transaction_snapshot_key(tx) -> tuple:
    """Dedupe key — installment payments on the same day stay distinct."""
    raw_date = getattr(tx, "date", None)
    if isinstance(raw_date, date):
        tx_date = raw_date.isoformat()
    else:
        tx_date = str(raw_date)[:10]
    merchant = getattr(tx, "merchant_he", "")
    notes = getattr(tx, "notes", None)
    installment = parse_installment(notes)
    if installment:
        current, total = installment
        return (tx_date, merchant, "inst", current, total)
    charge = round(float(getattr(tx, "charge_amount", 0) or 0), 2)
    note_key = notes or ""
    return (tx_date, merchant, "tx", charge, note_key)


def pick_better_transaction(a, b):
    """When the same purchase appears in multiple exports, keep the billed snapshot."""
    a_est = bool(getattr(a, "charge_estimated", False))
    b_est = bool(getattr(b, "charge_estimated", False))
    if a_est != b_est:
        return b if a_est else a

    a_inst = parse_installment(getattr(a, "notes", None))
    b_inst = parse_installment(getattr(b, "notes", None))
    if a_inst and b_inst:
        if a_inst[0] != b_inst[0]:
            return a if a_inst[0] > b_inst[0] else b

    if a.charge_amount != b.charge_amount:
        return a if a.charge_amount < b.charge_amount else b

    return b


def dedupe_transaction_snapshots(transactions: list) -> list:
    best: dict[tuple, object] = {}
    order: list[tuple] = []
    for tx in transactions:
        key = transaction_snapshot_key(tx)
        if key not in best:
            order.append(key)
            best[key] = tx
        else:
            best[key] = pick_better_transaction(best[key], tx)
    return [best[key] for key in order]


def is_refund_transaction(
    transaction_type_he: Optional[str],
    amount: float,
    charge_raw,
) -> bool:
    if transaction_type_he and any(m in transaction_type_he for m in REFUND_TYPE_MARKERS):
        return True
    if amount < 0:
        return True
    if charge_raw is not None:
        try:
            return float(charge_raw) < 0
        except (TypeError, ValueError):
            pass
    return False


def _tx_date_value(tx) -> date:
    raw = getattr(tx, "date", None)
    if isinstance(raw, date):
        return raw
    if isinstance(raw, str):
        return date.fromisoformat(raw[:10])
    raise TypeError(f"Unsupported transaction date: {raw!r}")


def find_matching_original_charge(
    merchant: str,
    foreign_amount: float,
    refund_date: date,
    transactions: list,
    *,
    skip_index: Optional[int] = None,
):
    """Find a prior purchase with the same merchant and foreign amount."""
    if foreign_amount <= 0:
        return None
    best = None
    best_date: Optional[date] = None
    for i, tx in enumerate(transactions):
        if skip_index is not None and i == skip_index:
            continue
        if getattr(tx, "merchant_he", "") != merchant:
            continue
        tx_amount = float(getattr(tx, "amount", 0))
        tx_charge = float(getattr(tx, "charge_amount", 0))
        tx_type = getattr(tx, "transaction_type_he", None)
        if is_refund_transaction(tx_type, tx_amount, tx_charge if tx_charge != 0 else None):
            continue
        if tx_charge <= 0:
            continue
        if abs(abs(tx_amount) - foreign_amount) > 0.02:
            continue
        tx_date = _tx_date_value(tx)
        if tx_date > refund_date:
            continue
        if best is None or tx_date > best_date:
            best = tx
            best_date = tx_date
    return best


def resolve_refund_ils(
    amount: float,
    charge_raw,
    merchant: str,
    tx_date: Optional[date] = None,
    explicit_currency: Optional[str] = None,
    transaction_type_he: Optional[str] = None,
    transactions_for_matching: Optional[list] = None,
    skip_index: Optional[int] = None,
) -> tuple[float, Optional[str], bool]:
    """Match refund to original charge when possible; otherwise convert via FX."""
    charge: Optional[float]
    if charge_raw is None:
        charge = None
    else:
        try:
            charge = float(charge_raw)
        except (TypeError, ValueError):
            charge = None

    foreign_amount = abs(amount) if amount != 0 else (abs(charge) if charge else 0.0)
    refund_date = tx_date or date.today()

    if transactions_for_matching:
        match = find_matching_original_charge(
            merchant,
            foreign_amount,
            refund_date,
            transactions_for_matching,
            skip_index=skip_index,
        )
        if match is not None:
            original_currency = getattr(match, "original_currency", None) or "ILS"
            estimated = bool(getattr(match, "charge_estimated", False))
            return _round_money(-abs(float(match.charge_amount))), original_currency, estimated

    if charge is not None and charge != 0 and foreign_amount > 0:
        ils_magnitude = abs(charge)
        if abs(ils_magnitude - foreign_amount) > 0.02:
            return _round_money(-ils_magnitude), "ILS", False

    if explicit_currency and explicit_currency != "ILS":
        rate = get_rate_to_ils(explicit_currency, refund_date)
        return _round_money(-foreign_amount * rate), explicit_currency, True

    base = abs(charge) if charge is not None and charge != 0 else foreign_amount
    return _round_money(-base), "ILS", False


def is_pending_charge(
    charge_raw,
    notes: Optional[str],
    *,
    transaction_type_he: Optional[str] = None,
    amount: Optional[float] = None,
) -> bool:
    if amount is not None and transaction_type_he is not None:
        if is_refund_transaction(transaction_type_he, amount, charge_raw):
            return False
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
    transaction_type_he: Optional[str] = None,
    transactions_for_matching: Optional[list] = None,
    skip_index: Optional[int] = None,
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

    if is_refund_transaction(transaction_type_he, amount, charge_raw):
        return resolve_refund_ils(
            amount,
            charge_raw,
            merchant,
            tx_date=tx_date,
            explicit_currency=explicit_currency,
            transaction_type_he=transaction_type_he,
            transactions_for_matching=transactions_for_matching,
            skip_index=skip_index,
        )

    if amount <= 0:
        return 0.0, None, False

    if is_interest_row(merchant) and charge is not None and charge > 0:
        return _round_money(charge), "ILS", False

    pending = is_pending_charge(
        charge_raw,
        notes,
        transaction_type_he=transaction_type_he,
        amount=amount,
    )

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
