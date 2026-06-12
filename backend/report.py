from __future__ import annotations

from pathlib import Path

from analyzer import SpendingReport


def format_report(report: SpendingReport) -> str:
    lines: list[str] = []
    meta = report.metadata

    lines.append("=" * 60)
    lines.append("SPENDING SUMMARY")
    lines.append("=" * 60)
    lines.append(f"Source file:      {meta.get('source_file', 'unknown')}")
    if meta.get("billing_date"):
        lines.append(f"Billing date:     {meta['billing_date'].isoformat()}")
    lines.append(f"Transactions:     {report.transaction_count}")
    lines.append(
        f"Period:           {report.date_range[0].isoformat()} → {report.date_range[1].isoformat()}"
    )
    lines.append(f"Total spent:      ₪{report.total_spent:,.2f}")
    lines.append("")

    lines.append("BY CATEGORY")
    lines.append("-" * 60)
    for item in report.by_category:
        hebrew = f" ({item.category_he})" if item.category_he else ""
        lines.append(
            f"  {item.category_en:<28}{hebrew:<22} "
            f"₪{item.total:>9,.2f}  {item.share_pct:5.1f}%  ({item.count} tx)"
        )
    lines.append("")

    lines.append("TOP MERCHANTS")
    lines.append("-" * 60)
    for item in report.top_merchants:
        lines.append(
            f"  {item.merchant_en:<32} ₪{item.total:>9,.2f}  "
            f"({item.count}x)  [{item.category_en}]"
        )
        if item.merchant_he != item.merchant_en:
            lines.append(f"    Hebrew: {item.merchant_he}")
    lines.append("")

    if report.unknown_merchants:
        lines.append("MERCHANTS NEEDING MANUAL MAPPING")
        lines.append("-" * 60)
        for name in report.unknown_merchants:
            lines.append(f"  - {name}")
        lines.append("")
        lines.append(
            "Tip: add entries in the app under Merchant mappings, or edit data/merchant_rules.json"
        )
        lines.append("")

    return "\n".join(lines)


def save_report(report: SpendingReport, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    stem = Path(report.metadata.get("source_file", "report")).stem
    text_path = output_dir / f"{stem}_summary.txt"
    text_path.write_text(format_report(report), encoding="utf-8")
    return text_path
