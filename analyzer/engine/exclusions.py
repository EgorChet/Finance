"""One-off charges to hide from totals (e.g. paid for someone else)."""
from __future__ import annotations

from analyzer import SpendingReport, analyze_spending
from models import Transaction

def _load_keys() -> set[str]:
    """Exclusions are applied by the Node API from Supabase, not local files."""
    return set()


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
