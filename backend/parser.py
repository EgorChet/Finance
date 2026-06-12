from __future__ import annotations

import re
from datetime import date, datetime
from pathlib import Path
from typing import Optional

import openpyxl

from models import Transaction

HEADER_MARKERS = ("תאריך", "שם בית עסק", "סכום")


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
    transactions: list[Transaction] = []

    for row in rows[header_idx + 1 :]:
        if not row or row[0] is None:
            continue
        try:
            transactions.append(
                Transaction(
                    date=_to_date(row[0]),
                    merchant_he=str(row[1] or "").strip(),
                    amount=_to_float(row[2]),
                    charge_amount=_to_float(row[3]),
                    transaction_type_he=str(row[4] or "").strip(),
                    category_he=str(row[5]).strip() if row[5] else None,
                    notes=str(row[6]).strip() if row[6] else None,
                )
            )
        except (ValueError, TypeError):
            continue

    metadata = {
        "sheet_name": sheet.title,
        "billing_date": billing_date,
        "source_file": path.name,
        "transaction_count": len(transactions),
    }
    return transactions, metadata
