from __future__ import annotations

import re
from datetime import date, datetime
from pathlib import Path
from typing import Optional

import openpyxl

from fx import (
    detect_currency,
    is_pending_charge,
    is_refund_transaction,
    resolve_charge_ils,
    should_skip_non_spend_row,
)
from fx_rates import prefetch_rates
from models import Transaction

HEADER_MARKERS = ("תאריך", "שם בית עסק", "סכום")
_PENDING_AMOUNT_CURRENCY = re.compile(
    r"(\d[\d,]*(?:\.\d+)?)\s*(PLN|USD|EUR|GBP|BGN|AMD)\b",
    re.IGNORECASE,
)
_PENDING_AMOUNT_ILS = re.compile(r"(\d[\d.,]*)\s*₪")


def _to_date(value) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    raise ValueError(f"Unexpected date value: {value!r}")


def _to_float(value) -> float:
    if value is None:
        return 0.0
    return float(value)


def _amount_key(amount: float) -> float:
    return round(amount, 2)


def _parse_amount_token(raw: str) -> float:
    """Parse Leumi header amounts — supports 39.90, 39,90, and 1,234.56."""
    text = raw.strip()
    if "," in text and "." in text:
        text = text.replace(",", "")
    elif "," in text:
        text = text.replace(",", ".")
    return float(text)


def parse_pending_currencies(rows: list[tuple], header_idx: int) -> dict[float, str]:
    """Leumi header lines list pending totals, e.g. '469.40 PLN' or '160.00 ₪'."""
    by_amount: dict[float, str] = {}
    for row in rows[:header_idx]:
        text = " ".join(str(c) for c in row if c)
        if "בתהליך קליטה" in text:
            for match in _PENDING_AMOUNT_ILS.finditer(text):
                amt = _amount_key(_parse_amount_token(match.group(1)))
                by_amount[amt] = "ILS"
        for match in _PENDING_AMOUNT_CURRENCY.finditer(text):
            amt = _amount_key(_parse_amount_token(match.group(1)))
            by_amount[amt] = match.group(2).upper()
    return by_amount


def _find_header_row(rows: list[tuple]) -> Optional[int]:
    for idx, row in enumerate(rows):
        joined = " ".join(str(cell) for cell in row if cell is not None)
        if all(marker in joined for marker in HEADER_MARKERS):
            return idx
    return None


def _parse_billing_date(rows: list[tuple]) -> Optional[date]:
    pattern = re.compile(r"עסקאות לחיוב ב-(\d{2})/(\d{2})/(\d{4})")
    for row in rows[:10]:
        for cell in row:
            if not isinstance(cell, str):
                continue
            match = pattern.search(cell)
            if match:
                day, month, year = map(int, match.groups())
                return date(year, month, day)
    return None


def parse_leumi_visa_xlsx(path: Path) -> tuple[list[Transaction], dict]:
    """Parse a Leumi Bank Visa charges export (.xlsx)."""
    workbook = openpyxl.load_workbook(path, data_only=True)
    sheet = workbook.active
    rows = list(sheet.iter_rows(values_only=True))

    header_idx = _find_header_row(rows)
    if header_idx is None:
        raise ValueError("Could not find transaction header row in spreadsheet.")

    billing_date = _parse_billing_date(rows)
    pending_currencies = parse_pending_currencies(rows, header_idx)
    transactions: list[Transaction] = []

    rate_pairs: set[tuple[str, str]] = set()
    for row in rows[header_idx + 1 :]:
        if not row or row[0] is None:
            continue
        try:
            amount = _to_float(row[2])
            tx_type = str(row[4] or "").strip()
            notes = str(row[6]).strip() if row[6] else None
            if not is_refund_transaction(tx_type, amount, row[3]) and (
                amount <= 0
                or not is_pending_charge(row[3], notes, transaction_type_he=tx_type, amount=amount)
            ):
                continue
            merchant = str(row[1] or "").strip()
            explicit = pending_currencies.get(_amount_key(amount))
            currency = detect_currency(merchant, amount, None, explicit)
            if currency != "ILS":
                rate_pairs.add((currency, _to_date(row[0]).isoformat()))
        except (ValueError, TypeError):
            continue

    if rate_pairs:
        prefetch_rates(rate_pairs)

    for row in rows[header_idx + 1 :]:
        if not row or row[0] is None:
            continue
        try:
            amount = _to_float(row[2])
            notes = str(row[6]).strip() if row[6] else None
            tx_type = str(row[4] or "").strip()
            merchant = str(row[1] or "").strip()
            if should_skip_non_spend_row(row[3], merchant, notes, transaction_type_he=tx_type):
                continue
            tx_date = _to_date(row[0])
            explicit = pending_currencies.get(_amount_key(amount))
            charge_ils, original_currency, estimated = resolve_charge_ils(
                amount,
                row[3],
                str(row[1] or "").strip(),
                notes,
                tx_date=tx_date,
                explicit_currency=explicit,
                transaction_type_he=tx_type,
                transactions_for_matching=transactions,
            )
            transactions.append(
                Transaction(
                    date=tx_date,
                    merchant_he=str(row[1] or "").strip(),
                    amount=amount,
                    charge_amount=charge_ils,
                    transaction_type_he=tx_type,
                    category_he=str(row[5]).strip() if row[5] else None,
                    notes=notes,
                    original_currency=original_currency,
                    charge_estimated=estimated,
                )
            )
        except (ValueError, TypeError):
            continue

    metadata = {
        "sheet_name": sheet.title,
        "billing_date": billing_date,
        "source_file": path.name,
        "transaction_count": len(transactions),
        "pending_currencies": _pending_currencies_metadata(pending_currencies),
    }
    return transactions, metadata


def _pending_currencies_metadata(pending: dict[float, str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for amount, currency in pending.items():
        out[str(amount)] = currency
        out[f"{amount:.2f}"] = currency
        out[f"{amount:.1f}"] = currency
    return out
