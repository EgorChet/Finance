"""Recurring monthly charges applied on top of card statement totals."""
from __future__ import annotations

import json
from dataclasses import replace
from datetime import date
from pathlib import Path

from analyzer import SpendingReport, analyze_spending
from models import Transaction

FIXED_CHARGES_PATH = Path(__file__).resolve().parent.parent / "data" / "fixed_charges.json"

# Matches default pace card cycle start; configured charges land on this day each month.
DEFAULT_BILLING_CYCLE_DAY = 10


def fixed_charge_date_for_billing(
    billing_date: date,
    cycle_day: int = DEFAULT_BILLING_CYCLE_DAY,
) -> date:
    """Pin recurring charges to the billing cycle start (e.g. 10th), not statement close date."""
    import calendar

    day = min(max(cycle_day, 1), 28)
    last = calendar.monthrange(billing_date.year, billing_date.month)[1]
    return date(billing_date.year, billing_date.month, min(day, last))


def _load_charges() -> list[dict]:
    if not FIXED_CHARGES_PATH.exists():
        return []
    with FIXED_CHARGES_PATH.open(encoding="utf-8") as f:
        data = json.load(f)
    return list(data.get("charges", []))


def month_key(billing_date: date | str | None) -> str | None:
    if billing_date is None:
        return None
    if isinstance(billing_date, str):
        return billing_date[:7]
    return billing_date.strftime("%Y-%m")


def charges_for_billing(billing_date: date | str | None) -> list[dict]:
    ym = month_key(billing_date)
    if not ym:
        return []
    applicable: list[dict] = []
    for charge in _load_charges():
        from_m = charge.get("from_month", "")
        through_m = charge.get("through_month")
        if through_m and from_m <= ym <= through_m:
            applicable.append(charge)
    return applicable


def _parse_billing_date(billing: date | str | None) -> date | None:
    if billing is None:
        return None
    if isinstance(billing, date):
        return billing
    return date.fromisoformat(billing)


def augment_report(report: SpendingReport) -> SpendingReport:
    from exclusions import apply_exclusions

    billing_date = _parse_billing_date(report.metadata.get("billing_date"))
    if billing_date is None:
        return apply_exclusions(report)

    applicable = charges_for_billing(billing_date)
    if not applicable:
        return apply_exclusions(report)

    charge_by_id = {c["id"]: c for c in applicable}
    charge_date = fixed_charge_date_for_billing(billing_date)
    month_label = billing_date.strftime("%b %Y")

    updated_txs: list[Transaction] = []
    for tx in report.transactions:
        if tx.notes and tx.notes.startswith("fixed_charge:"):
            charge_id = tx.notes.split(":", 1)[1]
            charge = charge_by_id.get(charge_id)
            if charge:
                updated_txs.append(
                    replace(
                        tx,
                        date=charge_date,
                        merchant_he=str(charge.get("name_he", charge["name_en"])),
                        merchant_en=str(charge["name_en"]),
                        amount=float(charge["amount"]),
                        charge_amount=float(charge["amount"]),
                        category_en=str(charge.get("category_en", "Uncategorized")),
                        billing_month=month_label,
                    )
                )
                continue
        updated_txs.append(tx)

    existing_ids = {
        tx.notes.split(":", 1)[1]
        for tx in updated_txs
        if tx.notes and tx.notes.startswith("fixed_charge:")
    }

    new_txs: list[Transaction] = []
    for charge in applicable:
        charge_id = charge["id"]
        if charge_id in existing_ids:
            continue
        new_txs.append(
            Transaction(
                date=charge_date,
                merchant_he=str(charge.get("name_he", charge["name_en"])),
                amount=float(charge["amount"]),
                charge_amount=float(charge["amount"]),
                transaction_type_he="חיוב קבוע",
                category_he=None,
                notes=f"fixed_charge:{charge_id}",
                merchant_en=str(charge["name_en"]),
                category_en=str(charge.get("category_en", "Uncategorized")),
                merchant_known=True,
                billing_month=month_label,
            )
        )

    if not new_txs and updated_txs == list(report.transactions):
        return apply_exclusions(report)

    result = analyze_spending(updated_txs + new_txs, dict(report.metadata))
    return apply_exclusions(result)
