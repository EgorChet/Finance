"""Repo paths used by the analyzer engine (local CLI / cache files)."""
from __future__ import annotations

from pathlib import Path

# analyzer/engine/paths.py → engine → analyzer → repo root
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
LOCAL_ROOT = REPO_ROOT / "local"
DATA_DIR = LOCAL_ROOT / "data"
STATEMENTS_DIR = LOCAL_ROOT / "statements"
