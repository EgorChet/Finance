"""Recurring monthly charges applied on top of card statement totals."""
from __future__ import annotations

from dataclasses import replace
from datetime import date

from analyzer import SpendingReport, analyze_spending
from models import Transaction

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


def _normalize_charge(charge: dict) -> dict:
    schedule = charge.get("schedule", "monthly")
    if schedule not in ("monthly", "once"):
        schedule = "monthly"
    from_m = str(charge.get("from_month", "")).strip()
    through_m = str(charge.get("through_month", "")).strip()
    charge_date = charge.get("charge_date")
    if charge_date:
        charge_date = str(charge_date).strip()[:10]
    if schedule == "once" and charge_date:
        ym = charge_date[:7]
        from_m = ym
        through_m = ym
    out = {
        "id": str(charge["id"]).strip(),
        "name_en": str(charge["name_en"]).strip(),
        "name_he": charge.get("name_he"),
        "amount": round(float(charge["amount"]), 2),
        "category_en": str(charge.get("category_en", "Uncategorized")).strip(),
        "from_month": from_m,
        "through_month": through_m,
        "schedule": schedule,
    }
    if charge_date:
        out["charge_date"] = charge_date
    return out


def _load_charges() -> list[dict]:
    """Fixed charges are applied by the Node API from Supabase, not local files."""
    return []


def month_key(billing_date: date | str | None) -> str | None:
    if billing_date is None:
        return None
    if isinstance(billing_date, str):
        return billing_date[:7]
    return billing_date.strftime("%Y-%m")


def cycle_start_for_statement_billing(
    billing_date: date,
    cycle_day: int = DEFAULT_BILLING_CYCLE_DAY,
) -> date:
    """Which cycle a statement bill belongs to (matches web pace utils)."""
    day = min(max(cycle_day, 1), 28)
    if billing_date.month == 1:
        prev_year = billing_date.year - 1
        prev_month = 12
    else:
        prev_year = billing_date.year
        prev_month = billing_date.month - 1
    import calendar

    last = calendar.monthrange(prev_year, prev_month)[1]
    return date(prev_year, prev_month, min(day, last))


def cycle_month_key_for_billing(billing_date: date | str | None) -> str | None:
    """Billing-cycle month (e.g. Feb 2026), not the statement charge month."""
    parsed = _parse_billing_date(billing_date)
    if parsed is None:
        return None
    return cycle_start_for_statement_billing(parsed).strftime("%Y-%m")


def charges_for_billing(billing_date: date | str | None) -> list[dict]:
    ym = cycle_month_key_for_billing(billing_date)
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
    cycle_start = cycle_start_for_statement_billing(billing_date)
    charge_by_id = {c["id"]: c for c in applicable}
    month_label = billing_date.strftime("%b %Y")

    updated_txs: list[Transaction] = []
    for tx in report.transactions:
        if tx.notes and tx.notes.startswith("fixed_charge:"):
            charge_id = tx.notes.split(":", 1)[1]
            charge = charge_by_id.get(charge_id)
            if not charge:
                continue
            if charge.get("schedule") == "once" and charge.get("charge_date"):
                charge_date = date.fromisoformat(charge["charge_date"])
            else:
                charge_date = fixed_charge_date_for_billing(cycle_start)
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
        if charge.get("schedule") == "once" and charge.get("charge_date"):
            tx_date = date.fromisoformat(charge["charge_date"])
            tx_type = "חיוב ידני"
        else:
            tx_date = fixed_charge_date_for_billing(cycle_start)
            tx_type = "חיוב קבוע"
        new_txs.append(
            Transaction(
                date=tx_date,
                merchant_he=str(charge.get("name_he", charge["name_en"])),
                amount=float(charge["amount"]),
                charge_amount=float(charge["amount"]),
                transaction_type_he=tx_type,
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
