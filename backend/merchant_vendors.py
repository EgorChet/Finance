"""Roll up chain branch names to a single display label."""
from __future__ import annotations

import re

_LEUMI_BONUS = re.compile(r"leumi\s*bonus|לאומי\s*בונוס", re.IGNORECASE)
_ARCAFFE = re.compile(r"arcaff|ארקפה", re.IGNORECASE)
_GOOD_PHARM = re.compile(r"good\s*[- ]?pharm|גוד\s*פארם", re.IGNORECASE)
_SUPER_PHARM = re.compile(r"super\s*[- ]?pharm|superpharm|סופר\s*פארם", re.IGNORECASE)
_TIV_TAAM = re.compile(r"tiv\s*taam|טיב\s*טעם", re.IGNORECASE)
_SHUFERSAL = re.compile(r"shufersal|שופרסל", re.IGNORECASE)
_CARREFOUR = re.compile(r"carrefour|קרפור", re.IGNORECASE)
_AMPM = re.compile(r"\bam:pm\b|am\s*pm", re.IGNORECASE)
_WOLT = re.compile(r"\bwolt\b|וולט", re.IGNORECASE)


def canonical_merchant_english(english: str, hebrew: str = "") -> str:
    n = (english or "").strip()
    if not n:
        return n
    text = f"{hebrew} {n}".strip()

    if _LEUMI_BONUS.search(text):
        return "Leumi Bonus"
    if _ARCAFFE.search(text):
        return "Arcaffe"
    if _GOOD_PHARM.search(text):
        return "Good Pharm"
    if _SUPER_PHARM.search(text):
        return "Super Pharm"
    if _TIV_TAAM.search(text):
        return "Tiv Taam"
    if _SHUFERSAL.search(text):
        return "Shufersal"
    if _CARREFOUR.search(text):
        return "Carrefour"
    if _AMPM.search(text):
        return "AM:PM"
    if _WOLT.search(text) and not _TIV_TAAM.search(text):
        return "Wolt"
    return n
