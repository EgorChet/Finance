"""FastAPI analyzer service — wraps existing Finance Python modules."""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from analyzer import analyze_spending  # noqa: E402
from history import report_from_dict, report_to_dict, _tx_from_dict  # noqa: E402
from maps import MapperStore  # noqa: E402
from maps import looks_hebrew, suggest_merchant_english  # noqa: E402
from pipeline import analyze_file  # noqa: E402
from translation_cache import get_cached, put_cached  # noqa: E402
from translator import translate_merchant_hebrew, translate_transactions  # noqa: E402

app = FastAPI(title="Finance Analyzer", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ReanalyzeRequest(BaseModel):
    statements: dict
    rules: dict
    auto_translate: bool = True


class CalAnalyzeRequest(BaseModel):
    transactions: list[dict]
    metadata: dict
    auto_translate: bool = True


class TranslateMerchantsRequest(BaseModel):
    texts: list[str]


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/analyze-file")
async def analyze_upload(
    file: UploadFile = File(...),
    auto_translate: bool = True,
) -> dict:
    print(f"analyze-file: {file.filename!r} auto_translate={auto_translate}", flush=True)
    suffix = Path(file.filename or "upload.xlsx").suffix or ".xlsx"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = Path(tmp.name)
    try:
        mapper = MapperStore()
        report = analyze_file(tmp_path, auto_translate=auto_translate, mapper=mapper)
        report.metadata["source_file"] = file.filename or tmp_path.name
        return report_to_dict(report)
    finally:
        tmp_path.unlink(missing_ok=True)


def _translate_one(raw: str) -> str | None:
    if not raw:
        return None
    if not looks_hebrew(raw):
        return raw
    if hint := suggest_merchant_english(raw):
        put_cached(raw, hint)
        return hint
    if cached := get_cached(raw):
        return cached
    translated = translate_merchant_hebrew(raw).strip()
    if translated and not looks_hebrew(translated) and translated != raw:
        put_cached(raw, translated)
        return translated
    return None


@app.post("/translate-merchants")
def translate_merchants(body: TranslateMerchantsRequest) -> dict:
    translations: dict[str, str] = {}
    for text in body.texts:
        raw = text.strip()
        if not raw:
            continue
        english = _translate_one(raw)
        if english:
            translations[raw] = english
    return {"translations": translations}


@app.get("/translate-merchant")
def translate_merchant(q: str = "") -> dict:
    raw = q.strip()
    if not raw:
        return {"english": ""}
    english = _translate_one(raw)
    return {"english": english or ""}


@app.post("/analyze-cal-transactions")
def analyze_cal_transactions(body: CalAnalyzeRequest) -> dict:
    from datetime import date as date_cls

    meta = dict(body.metadata)
    billing = meta.get("billing_date")
    if isinstance(billing, str):
        meta["billing_date"] = date_cls.fromisoformat(billing)

    mapper = MapperStore()
    transactions = [_tx_from_dict(tx) for tx in body.transactions]
    translate_transactions(transactions, mapper, auto_translate_unknown=body.auto_translate)
    report = analyze_spending(transactions, meta)
    return report_to_dict(report)


@app.post("/reanalyze-all")
def reanalyze_all(body: ReanalyzeRequest) -> dict:
    mapper = MapperStore()
    mapper.merge_user_rules(body.rules)
    statements = dict(body.statements.get("statements", {}))
    count = 0
    for key, entry in list(statements.items()):
        report = report_from_dict(entry["report"])
        translate_transactions(
            report.transactions,
            mapper,
            auto_translate_unknown=body.auto_translate,
        )
        refreshed = analyze_spending(report.transactions, report.metadata)
        entry["report"] = report_to_dict(refreshed)
        statements[key] = entry
        count += 1
    return {"statements": statements, "updated_count": count}


@app.post("/analyze-bytes")
async def analyze_bytes(
    file: UploadFile = File(...),
    auto_translate: bool = True,
) -> dict:
    return await analyze_upload(file=file, auto_translate=auto_translate)
