"""Fetch currency→ILS rates from Frankfurter (Bank of Israel data). Used only for pending charges."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path
from typing import Optional

FRANKFURTER_V2 = "https://api.frankfurter.dev/v2/rate"
FRANKFURTER_V1 = "https://api.frankfurter.dev/v1"

FX_CURRENCIES = ("USD", "EUR", "PLN", "GBP", "BGN", "AMD")

FALLBACK_PATH = Path(__file__).resolve().parent.parent / "data" / "fx_fallback.json"

_tx_cache: dict[tuple[str, str], float] = {}
_daily_rates: dict[str, float] = {}
_daily_updated: str = ""


def _supabase_configured() -> bool:
    return bool(os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY"))


def _supabase_headers() -> dict[str, str]:
    key = os.environ["SUPABASE_SERVICE_KEY"]
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def _read_fallback_supabase() -> dict:
    if not _supabase_configured():
        return {}
    url = f"{os.environ['SUPABASE_URL']}/rest/v1/app_state?id=eq.fx_fallback&select=data"
    req = urllib.request.Request(url, headers=_supabase_headers())
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            rows = json.loads(resp.read())
            if rows and isinstance(rows, list):
                data = rows[0].get("data") or {}
                if isinstance(data, dict):
                    return data
    except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError, urllib.error.HTTPError, KeyError):
        pass
    return {}


def _write_fallback_supabase(updated: str, rates: dict[str, float]) -> None:
    if not _supabase_configured():
        return
    url = f"{os.environ['SUPABASE_URL']}/rest/v1/app_state"
    body = json.dumps({"id": "fx_fallback", "data": {"updated": updated, "rates": rates}}).encode()
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={**_supabase_headers(), "Prefer": "resolution=merge-duplicates"},
    )
    try:
        urllib.request.urlopen(req, timeout=8)
    except (urllib.error.URLError, TimeoutError, urllib.error.HTTPError):
        pass


def _read_fallback_file() -> dict:
    stored = _read_fallback_supabase()
    if stored.get("rates"):
        return stored

    try:
        if FALLBACK_PATH.exists():
            return json.loads(FALLBACK_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError, json.JSONDecodeError):
        pass
    return {"updated": "", "rates": {}}


def _write_fallback_file(updated: str, rates: dict[str, float]) -> None:
    _write_fallback_supabase(updated, rates)
    try:
        FALLBACK_PATH.parent.mkdir(parents=True, exist_ok=True)
        FALLBACK_PATH.write_text(
            json.dumps({"updated": updated, "rates": rates}, indent=2) + "\n",
            encoding="utf-8",
        )
    except OSError:
        pass


def _today_iso() -> str:
    return date.today().isoformat()


def _http_get(url: str) -> Optional[dict]:
    req = urllib.request.Request(url, headers={"User-Agent": "Finance/1.0 (fx-rates)"})
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            return json.loads(resp.read())
    except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError, urllib.error.HTTPError):
        return None


def _fetch_rate(currency: str, date_iso: str) -> Optional[float]:
    data = _http_get(f"{FRANKFURTER_V2}/{currency}/ILS/{date_iso}")
    if data and data.get("rate") is not None:
        return float(data["rate"])

    data = _http_get(f"{FRANKFURTER_V1}/{date_iso}?from={currency}&to=ILS")
    if data:
        ils = data.get("rates", {}).get("ILS")
        if ils is not None:
            return float(ils)

    return None


def _fetch_today_rates() -> dict[str, float]:
    today = _today_iso()
    rates: dict[str, float] = {"ILS": 1.0}
    for currency in FX_CURRENCIES:
        rate = _fetch_rate(currency, today)
        if rate is not None:
            rates[currency] = rate
    return rates if len(rates) > 1 else {}


def ensure_daily_fallback() -> dict[str, float]:
    """Load today's rates from Supabase/disk or Frankfurter; refresh once per calendar day."""
    global _daily_rates, _daily_updated

    today = _today_iso()
    if _daily_updated == today and _daily_rates:
        return _daily_rates

    stored = _read_fallback_file()
    stored_rates = stored.get("rates") or {}
    if stored.get("updated") == today and isinstance(stored_rates, dict) and stored_rates:
        _daily_rates = {k: float(v) for k, v in stored_rates.items()}
        _daily_updated = today
        return _daily_rates

    fresh = _fetch_today_rates()
    if fresh:
        _write_fallback_file(today, fresh)
        _daily_rates = fresh
        _daily_updated = today
        return _daily_rates

    if isinstance(stored_rates, dict) and stored_rates:
        _daily_rates = {k: float(v) for k, v in stored_rates.items()}
        _daily_updated = str(stored.get("updated") or "")
        return _daily_rates

    _daily_rates = {"ILS": 1.0}
    _daily_updated = today
    return _daily_rates


def fallback_rate(currency: str) -> float:
    rates = ensure_daily_fallback()
    return rates.get(currency, rates.get("USD", 1.0))


def get_rate_to_ils(currency: str, tx_date: date | str) -> float:
    """How many ILS for 1 unit of `currency` on `tx_date`."""
    if currency == "ILS":
        return 1.0

    ensure_daily_fallback()
    date_iso = tx_date.isoformat() if isinstance(tx_date, date) else tx_date[:10]
    key = (currency, date_iso)
    if key in _tx_cache:
        return _tx_cache[key]

    rate = _fetch_rate(currency, date_iso)
    if rate is None:
        rate = fallback_rate(currency)

    _tx_cache[key] = rate
    return rate


def prefetch_rates(pairs: set[tuple[str, str]]) -> None:
    """Warm cache for (currency, YYYY-MM-DD) pairs before parsing a statement."""
    ensure_daily_fallback()
    for currency, date_iso in pairs:
        get_rate_to_ils(currency, date_iso)


def clear_rate_cache() -> None:
    _tx_cache.clear()
