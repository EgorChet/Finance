"""Persistent cache for Hebrew → English merchant translations."""
from __future__ import annotations

import json

from paths import DATA_DIR

CACHE_PATH = DATA_DIR / "translation_cache.json"


def load_cache() -> dict[str, str]:
    if not CACHE_PATH.exists():
        return {}
    try:
        with CACHE_PATH.open(encoding="utf-8") as f:
            data = json.load(f)
        return {str(k): str(v) for k, v in data.items() if k and v}
    except (json.JSONDecodeError, OSError):
        return {}


def save_cache(cache: dict[str, str]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CACHE_PATH.open("w", encoding="utf-8") as f:
        json.dump(dict(sorted(cache.items())), f, ensure_ascii=False, indent=2)


def get_cached(hebrew: str) -> str | None:
    return load_cache().get(hebrew.strip())


def put_cached(hebrew: str, english: str) -> None:
    hebrew = hebrew.strip()
    english = english.strip()
    if not hebrew or not english:
        return
    cache = load_cache()
    if cache.get(hebrew) == english:
        return
    cache[hebrew] = english
    save_cache(cache)
