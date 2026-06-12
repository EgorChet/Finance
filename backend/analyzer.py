from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, replace
from datetime import date

from models import Transaction


def _month_label(billing_date: date | None) -> str:
    if billing_date is None:
        return "Unknown month"
    return billing_date.strftime("%b %Y")


@dataclass
class CategorySummary:
    category_en: str
    category_he: str | None
    total: float
    count: int
    share_pct: float


@dataclass
class MerchantSummary:
    merchant_en: str
    merchant_he: str
    category_en: str
    total: float
    count: int


@dataclass
class SpendingReport:
    metadata: dict
    total_spent: float
    transaction_count: int
    date_range: tuple[date, date]
    by_category: list[CategorySummary]
    top_merchants: list[MerchantSummary]
    unknown_merchants: list[str]
    transactions: list[Transaction]


def analyze_spending(transactions: list[Transaction], metadata: dict) -> SpendingReport:
    if not transactions:
        return SpendingReport(
            metadata=metadata,
            total_spent=0.0,
            transaction_count=0,
            date_range=(date.today(), date.today()),
            by_category=[],
            top_merchants=[],
            unknown_merchants=[],
            transactions=[],
        )

    total = sum(tx.charge_amount for tx in transactions)
    dates = [tx.date for tx in transactions]

    category_totals: dict[str, float] = defaultdict(float)
    category_counts: dict[str, int] = defaultdict(int)
    category_hebrew: dict[str, str | None] = {}

    merchant_totals: dict[str, float] = defaultdict(float)
    merchant_counts: dict[str, int] = defaultdict(int)
    merchant_meta: dict[str, tuple[str, str]] = {}

    for tx in transactions:
        cat = tx.category_en or "Uncategorized"
        category_totals[cat] += tx.charge_amount
        category_counts[cat] += 1
        category_hebrew.setdefault(cat, tx.category_he)

        key = tx.merchant_en or tx.merchant_he
        merchant_totals[key] += tx.charge_amount
        merchant_counts[key] += 1
        merchant_meta[key] = (tx.merchant_he, tx.category_en)

    by_category = sorted(
        [
            CategorySummary(
                category_en=cat,
                category_he=category_hebrew.get(cat),
                total=amount,
                count=category_counts[cat],
                share_pct=(amount / total * 100) if total else 0.0,
            )
            for cat, amount in category_totals.items()
        ],
        key=lambda item: item.total,
        reverse=True,
    )

    top_merchants = sorted(
        [
            MerchantSummary(
                merchant_en=name,
                merchant_he=merchant_meta[name][0],
                category_en=merchant_meta[name][1],
                total=amount,
                count=merchant_counts[name],
            )
            for name, amount in merchant_totals.items()
        ],
        key=lambda item: item.total,
        reverse=True,
    )[:15]

    unknown = sorted(
        {
            tx.merchant_he
            for tx in transactions
            if not tx.merchant_known and tx.merchant_en == tx.merchant_he
        }
    )

    return SpendingReport(
        metadata=metadata,
        total_spent=total,
        transaction_count=len(transactions),
        date_range=(min(dates), max(dates)),
        by_category=by_category,
        top_merchants=top_merchants,
        unknown_merchants=unknown,
        transactions=transactions,
    )


def combine_reports(reports: list[SpendingReport], label: str) -> SpendingReport:
    """Sum monthly billing reports (each file = one bill). Does not merge raw tx lists."""
    if not reports:
        raise ValueError("No reports to combine")
    if len(reports) == 1:
        return reports[0]

    total = sum(r.total_spent for r in reports)
    tx_count = sum(r.transaction_count for r in reports)
    all_dates = [d for r in reports for d in r.date_range]

    category_totals: dict[str, float] = defaultdict(float)
    category_counts: dict[str, int] = defaultdict(int)
    category_hebrew: dict[str, str | None] = {}

    merchant_totals: dict[str, float] = defaultdict(float)
    merchant_counts: dict[str, int] = defaultdict(int)
    merchant_meta: dict[str, tuple[str, str]] = {}

    unknown: set[str] = set()
    combined_transactions: list[Transaction] = []

    for report in reports:
        month_label = _month_label(report.metadata.get("billing_date"))
        for tx in report.transactions:
            combined_transactions.append(replace(tx, billing_month=month_label))
        for item in report.by_category:
            category_totals[item.category_en] += item.total
            category_counts[item.category_en] += item.count
            category_hebrew.setdefault(item.category_en, item.category_he)
        for tx in report.transactions:
            key = tx.merchant_en or tx.merchant_he
            merchant_totals[key] += tx.charge_amount
            merchant_counts[key] += 1
            merchant_meta[key] = (tx.merchant_he, tx.category_en)
            if not tx.merchant_known and tx.merchant_en == tx.merchant_he:
                unknown.add(tx.merchant_he)
        unknown.update(report.unknown_merchants)

    by_category = sorted(
        [
            CategorySummary(
                category_en=cat,
                category_he=category_hebrew.get(cat),
                total=amount,
                count=category_counts[cat],
                share_pct=(amount / total * 100) if total else 0.0,
            )
            for cat, amount in category_totals.items()
        ],
        key=lambda item: item.total,
        reverse=True,
    )

    top_merchants = sorted(
        [
            MerchantSummary(
                merchant_en=name,
                merchant_he=merchant_meta[name][0],
                category_en=merchant_meta[name][1],
                total=amount,
                count=merchant_counts[name],
            )
            for name, amount in merchant_totals.items()
        ],
        key=lambda item: item.total,
        reverse=True,
    )[:15]

    billing_dates = [r.metadata.get("billing_date") for r in reports if r.metadata.get("billing_date")]

    return SpendingReport(
        metadata={
            "source_file": label,
            "billing_date": None,
            "combined_billing_dates": billing_dates,
            "statement_count": len(reports),
        },
        total_spent=total,
        transaction_count=tx_count,
        date_range=(min(all_dates), max(all_dates)),
        by_category=by_category,
        top_merchants=top_merchants,
        unknown_merchants=sorted(unknown),
        transactions=combined_transactions,
    )
