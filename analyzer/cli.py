from __future__ import annotations

import argparse
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent
_ENGINE = _ROOT / "engine"
if str(_ENGINE) not in sys.path:
    sys.path.insert(0, str(_ENGINE))


from history import StatementStore
from maps import MapperStore
from pipeline import analyze_file
from report import format_report, save_report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Analyze Hebrew Leumi Visa statements and summarize spending in English."
    )
    parser.add_argument("file", type=Path, nargs="?", help="Path to the .xlsx bank export")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("output"),
        help="Directory for summary output (default: output/)",
    )
    parser.add_argument(
        "--no-translate",
        action="store_true",
        help="Skip auto-translation for unknown Hebrew merchants",
    )
    parser.add_argument(
        "--sync",
        action="store_true",
        help="Scan local/statements for .xlsx files and save to local/data/statements.json",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.sync:
        store = StatementStore()
        mapper = MapperStore()
        synced = store.sync_from_disk(mapper, auto_translate=not args.no_translate)
        rows = store.summary_rows()
        print(f"Synced {len(synced)} updated statement(s). {len(rows)} month(s) saved.")
        for row in rows:
            print(
                f"  {row['Month']}: ₪{row['Total (₪)']:,.2f} "
                f"({row['Transactions']} tx) — {row['Source file']}"
            )
        if len(rows) > 1:
            combined = store.combined_report()
            if combined:
                print(f"\nCombined total: ₪{combined.total_spent:,.2f}")
        return 0

    if args.file is None:
        raise SystemExit("Provide a file path or use --sync to analyze all .xlsx files in the folder.")

    if not args.file.exists():
        raise SystemExit(f"File not found: {args.file}")

    report = analyze_file(args.file, auto_translate=not args.no_translate)

    print(format_report(report))
    out_path = save_report(report, args.output)
    print(f"Saved summary to: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
