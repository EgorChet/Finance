from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

from analyzer import CategorySummary, MerchantSummary, SpendingReport, analyze_spending, combine_reports
from fixed_charges import augment_report
from maps import DEFAULT_DATA_DIR, MapperStore, can_persist_locally
from models import Transaction
from paths import REPO_ROOT, STATEMENTS_DIR
from pipeline import analyze_file
from translator import translate_transactions

STATEMENTS_PATH = DEFAULT_DATA_DIR / "statements.json"
PROJECT_ROOT = REPO_ROOT
SCAN_DIRS = (STATEMENTS_DIR,)


def _billing_key(billing_date: date | None) -> str:
    if billing_date is None:
        return "unknown"
    return billing_date.isoformat()


def _month_label(billing_date: date | None) -> str:
    if billing_date is None:
        return "Unknown month"
    return billing_date.strftime("%b %Y")


def _file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _tx_to_dict(tx: Transaction) -> dict:
    return {
        "date": tx.date.isoformat(),
        "merchant_he": tx.merchant_he,
        "amount": tx.amount,
        "charge_amount": tx.charge_amount,
        "transaction_type_he": tx.transaction_type_he,
        "category_he": tx.category_he,
        "notes": tx.notes,
        "merchant_en": tx.merchant_en,
        "category_en": tx.category_en,
        "merchant_known": tx.merchant_known,
        "billing_month": tx.billing_month,
        "original_currency": tx.original_currency,
        "charge_estimated": tx.charge_estimated,
    }


def _tx_from_dict(data: dict) -> Transaction:
    return Transaction(
        date=date.fromisoformat(data["date"]),
        merchant_he=data["merchant_he"],
        amount=float(data["amount"]),
        charge_amount=float(data["charge_amount"]),
        transaction_type_he=data["transaction_type_he"],
        category_he=data.get("category_he"),
        notes=data.get("notes"),
        merchant_en=data.get("merchant_en", ""),
        category_en=data.get("category_en", ""),
        merchant_known=bool(data.get("merchant_known", False)),
        billing_month=data.get("billing_month"),
        original_currency=data.get("original_currency"),
        charge_estimated=bool(data.get("charge_estimated", False)),
    )


def _category_to_dict(item: CategorySummary) -> dict:
    return {
        "category_en": item.category_en,
        "category_he": item.category_he,
        "total": item.total,
        "count": item.count,
        "share_pct": item.share_pct,
    }


def _category_from_dict(data: dict) -> CategorySummary:
    return CategorySummary(**data)


def _merchant_to_dict(item: MerchantSummary) -> dict:
    return {
        "merchant_en": item.merchant_en,
        "merchant_he": item.merchant_he,
        "category_en": item.category_en,
        "total": item.total,
        "count": item.count,
    }


def _merchant_from_dict(data: dict) -> MerchantSummary:
    return MerchantSummary(**data)


def report_to_dict(report: SpendingReport) -> dict:
    meta = dict(report.metadata)
    billing = meta.get("billing_date")
    if isinstance(billing, date):
        meta["billing_date"] = billing.isoformat()
    return {
        "metadata": meta,
        "total_spent": report.total_spent,
        "transaction_count": report.transaction_count,
        "date_range": [
            report.date_range[0].isoformat(),
            report.date_range[1].isoformat(),
        ],
        "by_category": [_category_to_dict(c) for c in report.by_category],
        "top_merchants": [_merchant_to_dict(m) for m in report.top_merchants],
        "unknown_merchants": report.unknown_merchants,
        "transactions": [_tx_to_dict(tx) for tx in report.transactions],
    }


def report_from_dict(data: dict) -> SpendingReport:
    meta = dict(data["metadata"])
    billing = meta.get("billing_date")
    if isinstance(billing, str):
        meta["billing_date"] = date.fromisoformat(billing)
    return SpendingReport(
        metadata=meta,
        total_spent=float(data["total_spent"]),
        transaction_count=int(data["transaction_count"]),
        date_range=(
            date.fromisoformat(data["date_range"][0]),
            date.fromisoformat(data["date_range"][1]),
        ),
        by_category=[_category_from_dict(c) for c in data["by_category"]],
        top_merchants=[_merchant_from_dict(m) for m in data["top_merchants"]],
        unknown_merchants=list(data.get("unknown_merchants", [])),
        transactions=[_tx_from_dict(tx) for tx in data["transactions"]],
    )


class StatementStore:
    def __init__(self, path: Path = STATEMENTS_PATH):
        self.path = path
        self._data = self._load()

    def _load(self) -> dict:
        if not self.path.exists():
            return {"statements": {}, "updated_at": None}
        with self.path.open(encoding="utf-8") as f:
            return json.load(f)

    def _save(self) -> bool:
        if not can_persist_locally(self.path):
            return False
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._data["updated_at"] = datetime.utcnow().isoformat(timespec="seconds") + "Z"
        with self.path.open("w", encoding="utf-8") as f:
            json.dump(self._data, f, ensure_ascii=False, indent=2)
        return True

    def list_reports(self) -> list[SpendingReport]:
        items = []
        for key in sorted(self._data.get("statements", {}).keys()):
            items.append(augment_report(report_from_dict(self._data["statements"][key]["report"])))
        return items

    def get_report(self, billing_key: str) -> SpendingReport | None:
        entry = self._data.get("statements", {}).get(billing_key)
        if not entry:
            return None
        return augment_report(report_from_dict(entry["report"]))

    def remember_report(self, report: SpendingReport, *, source_path: Path, file_hash: str) -> str:
        billing = report.metadata.get("billing_date")
        key = _billing_key(billing)
        on_disk = self._load()
        self._data["statements"] = on_disk.get("statements", {})
        self._data["statements"][key] = {
            "billing_key": key,
            "month_label": _month_label(billing),
            "source_file": report.metadata.get("source_file", source_path.name),
            "source_path": str(source_path),
            "file_hash": file_hash,
            "saved_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
            "report": report_to_dict(report),
        }
        self._save()
        return key

    def discover_xlsx_files(self) -> list[Path]:
        found: dict[str, Path] = {}
        for directory in SCAN_DIRS:
            if not directory.exists():
                continue
            for path in sorted(directory.glob("*.xlsx")):
                found[str(path.resolve())] = path
        return list(found.values())

    def _is_cached_file(self, digest: str) -> bool:
        return any(
            entry.get("file_hash") == digest
            for entry in self._data.get("statements", {}).values()
        )

    def sync_from_disk(
        self,
        mapper: MapperStore,
        *,
        auto_translate: bool = True,
    ) -> list[str]:
        """Import new or changed .xlsx files. Unchanged files are skipped."""
        synced: list[str] = []
        for path in self.discover_xlsx_files():
            digest = _file_hash(path)
            if self._is_cached_file(digest):
                continue
            report = analyze_file(path, auto_translate=auto_translate, mapper=mapper)
            billing = report.metadata.get("billing_date")
            key = _billing_key(billing)
            report.metadata["source_file"] = path.name
            self.remember_report(report, source_path=path, file_hash=digest)
            synced.append(key)
        return synced

    def month_catalog(self) -> list[dict]:
        rows = []
        for key in sorted(self._data.get("statements", {}).keys()):
            entry = self._data["statements"][key]
            rows.append(
                {
                    "key": key,
                    "label": entry.get("month_label", _month_label(date.fromisoformat(key))),
                    "billing_date": date.fromisoformat(key),
                }
            )
        return rows

    def keys_in_range(self, from_key: str, to_key: str) -> list[str]:
        if from_key > to_key:
            from_key, to_key = to_key, from_key
        return [k for k in sorted(self._data.get("statements", {}).keys()) if from_key <= k <= to_key]

    def combined_report(self, billing_keys: list[str] | None = None) -> SpendingReport | None:
        reports = self.list_reports()
        if not reports:
            return None
        if billing_keys is not None:
            key_set = set(billing_keys)
            selected = [
                r for r in reports
                if _billing_key(r.metadata.get("billing_date")) in key_set
            ]
            selected.sort(key=lambda r: _billing_key(r.metadata.get("billing_date")))
        else:
            selected = reports
        if not selected:
            return None
        if len(selected) == 1:
            return selected[0]
        labels = [_month_label(r.metadata.get("billing_date")) for r in selected]
        label = f"{labels[0]} – {labels[-1]} ({len(selected)} months)"
        return combine_reports(selected, label)

    def reanalyze_all(self, mapper: MapperStore, *, auto_translate: bool = False) -> int:
        """Re-apply merchant/category rules to saved statements (no .xlsx re-parse)."""
        count = 0
        for entry in list(self._data.get("statements", {}).values()):
            report = report_from_dict(entry["report"])
            translate_transactions(
                report.transactions,
                mapper,
                auto_translate_unknown=auto_translate,
            )
            refreshed = analyze_spending(report.transactions, report.metadata)
            source_path = Path(entry.get("source_path", "."))
            self.remember_report(
                refreshed,
                source_path=source_path,
                file_hash=entry.get("file_hash", ""),
            )
            count += 1
        return count

    def merchant_catalog(self, mapper: MapperStore) -> list[dict]:
        """Every known merchant with the English name and category currently in use."""
        merchants: dict[str, dict] = {}
        for report in self.list_reports():
            for tx in report.transactions:
                hebrew = tx.merchant_he
                if hebrew in merchants:
                    continue
                rule = mapper.get_rule(hebrew)
                resolved_en, _ = mapper.resolve_merchant(hebrew)
                english = (rule.english if rule and rule.english else resolved_en) or tx.merchant_en
                if rule and rule.category:
                    category = rule.category
                else:
                    category = tx.category_en or mapper.resolve_category(
                        hebrew, tx.category_he, english
                    )
                merchants[hebrew] = {
                    "Hebrew": hebrew,
                    "English": english,
                    "Category": category,
                }
        return [merchants[key] for key in sorted(merchants)]

    def summary_rows(self) -> list[dict]:
        rows = []
        for key in sorted(self._data.get("statements", {}).keys()):
            entry = self._data["statements"][key]
            report = augment_report(report_from_dict(entry["report"]))
            rows.append(
                {
                    "Month": entry.get("month_label", key),
                    "Billing date": report.metadata.get("billing_date"),
                    "Total (₪)": report.total_spent,
                    "Transactions": report.transaction_count,
                    "Source file": entry.get("source_file", ""),
                }
            )
        return rows
