from __future__ import annotations

from pathlib import Path

from analyzer import SpendingReport, analyze_spending
from maps import MapperStore
from parser import parse_leumi_visa_xlsx
from translator import translate_transactions


def analyze_file(
    path: Path,
    *,
    auto_translate: bool = True,
    mapper: MapperStore | None = None,
) -> SpendingReport:
    transactions, metadata = parse_leumi_visa_xlsx(path)
    store = mapper or MapperStore()
    translate_transactions(transactions, store, auto_translate_unknown=auto_translate)
    return analyze_spending(transactions, metadata)
