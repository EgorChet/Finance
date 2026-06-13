"""One-off charges to hide from totals (e.g. paid for someone else)."""
from __future__ import annotations

import json
from pathlib import Path

from analyzer import SpendingReport, analyze_spending
from models import Transaction

EXCLUSIONS_PATH = Path(__file__).resolve().parent.parent / "data" / "excluded_transactions.json"


def _load_keys() -> set[str]:
    if not EXCLUSIONS_PATH.exists():
        return set()
    with EXCLUSIONS_PATH.open(encoding="utf-8") as f:
        data = json.load(f)
    keys: set[str] = set()
    for entry in data.get("entries", []):
        key = str(entry.get("key", "")).strip()
        if key:
            keys.add(key)
    return keys


def transaction_key(tx: Transaction) -> str:
    return f"{tx.date}|{tx.merchant_he}|{tx.charge_amount:.2f}"


def apply_exclusions(report: SpendingReport) -> SpendingReport:
    excluded = _load_keys()
    if not excluded:
        return report
    kept = [tx for tx in report.transactions if transaction_key(tx) not in excluded]
    if len(kept) == len(report.transactions):
        return report
    return analyze_spending(kept, dict(report.metadata))
