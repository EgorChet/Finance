from datetime import date
from unittest.mock import patch

from fx import detect_currency, resolve_charge_ils, should_skip_installment_row, should_skip_non_spend_row
from parser import parse_pending_currencies


def test_cursor_usd_uses_bank_ils_charge():
    charge, currency, estimated = resolve_charge_ils(
        8.96, 31.14, "CURSOR, AI POWERED IDE", None, tx_date=date(2026, 6, 17)
    )
    assert charge == 31.14
    assert currency == "USD"
    assert estimated is False


@patch("fx.get_rate_to_ils", return_value=0.95)
def test_pending_openai_uses_parser_currency_without_header_metadata(_mock):
    """When metadata is missing, keep PLN from parser — do not guess USD from OPENAI."""
    charge, currency, estimated = resolve_charge_ils(
        469.4,
        373.09,
        "OPENAI *CHATGPT SUBSCR +14158799686 IE",
        "עסקה בקליטה",
        tx_date=date(2026, 6, 19),
        explicit_currency="PLN",
    )
    assert currency == "PLN"
    assert estimated is True
    assert charge == round(469.4 * 0.95, 2)


@patch("fx.get_rate_to_ils", return_value=0.95)
def test_pending_openai_keeps_pln_after_estimate(_mock):
    """API re-normalize must not treat estimated ILS as bank charge (IE suffix → EUR bug)."""
    charge, currency, estimated = resolve_charge_ils(
        469.4,
        373.09,
        "OPENAI *CHATGPT SUBSCR +14158799686 IE",
        "עסקה בקליטה",
        tx_date=date(2026, 6, 19),
        explicit_currency="PLN",
    )
    assert currency == "PLN"
    assert estimated is True
    assert charge == round(469.4 * 0.95, 2)


@patch("fx.get_rate_to_ils", return_value=0.95)
def test_pending_openai_uses_pln_from_header(_mock):
    charge, currency, estimated = resolve_charge_ils(
        469.4,
        None,
        "OPENAI *CHATGPT SUBSCR +14158799686 IE",
        "עסקה בקליטה",
        tx_date=date(2026, 6, 19),
        explicit_currency="PLN",
    )
    assert currency == "PLN"
    assert estimated is True
    assert charge == round(469.4 * 0.95, 2)


def test_parse_pending_currencies_from_header():
    rows = [
        ("עסקאות בתהליך קליטה 313.82 ₪ ובנוסף 469.40 PLN",),
        ("תאריך", "שם בית עסק", "סכום"),
    ]
    assert parse_pending_currencies(rows, 1) == {469.4: "PLN"}


def test_parser_metadata_includes_pending_currencies():
    import glob
    from pathlib import Path
    from parser import parse_leumi_visa_xlsx

    files = glob.glob(str(Path(__file__).resolve().parents[2] / "statements" / "*19.06.26*.xlsx"))
    assert files, "Jun 19 statement fixture missing"
    _, meta = parse_leumi_visa_xlsx(Path(files[0]))
    assert meta["pending_currencies"]["469.4"] == "PLN"
    assert meta["pending_currencies"]["469.40"] == "PLN"


def test_pending_israeli_uses_amount_as_ils():
    charge, currency, estimated = resolve_charge_ils(
        47.9, None, "חינם פלוס נתניה", "עסקה בקליטה", tx_date=date(2026, 6, 19)
    )
    assert charge == 47.9
    assert currency == "ILS"
    assert estimated is True


def test_installment_uses_ils_slice():
    charge, _, estimated = resolve_charge_ils(
        1500,
        511.71,
        "מרכז לגביית קנסות",
        "תשלום 1 מתוך 3",
        tx_date=date(2026, 6, 5),
    )
    assert charge == 511.71
    assert estimated is False


def test_installment_payment_zero_is_skipped():
    assert should_skip_installment_row(None, "תשלום 0 מתוך 3", transaction_type_he="רכישה בקרדיט")


def test_installment_payment_one_with_charge_is_kept():
    assert not should_skip_installment_row(511.71, "תשלום 1 מתוך 3", transaction_type_he="רכישה בקרדיט")


def test_dedupe_prefers_billed_installment_over_estimate():
    from dataclasses import dataclass
    from fx import dedupe_transaction_snapshots

    @dataclass
    class Tx:
        date: date
        merchant_he: str
        charge_amount: float
        charge_estimated: bool = False
        notes: str | None = None

    txs = dedupe_transaction_snapshots([
        Tx(date(2026, 6, 5), "מרכז לגביית קנסות", 1500, True, "תשלום 1 מתוך 3"),
        Tx(date(2026, 6, 5), "מרכז לגביית קנסות", 511.71, False, "תשלום 1 מתוך 3"),
    ])
    assert len(txs) == 1
    assert txs[0].charge_amount == 511.71


def test_dedupe_keeps_same_day_installment_plan():
    from dataclasses import dataclass
    from fx import dedupe_transaction_snapshots

    @dataclass
    class Tx:
        date: date
        merchant_he: str
        charge_amount: float
        notes: str | None = None

    txs = dedupe_transaction_snapshots([
        Tx(date(2025, 11, 11), "GO MOBILE", 1470, "תשלום 1 מתוך 3"),
        Tx(date(2025, 11, 11), "GO MOBILE", 1468, "תשלום 2 מתוך 3"),
        Tx(date(2025, 11, 11), "GO MOBILE", 1468, "תשלום 3 מתוך 3"),
    ])
    assert len(txs) == 3


def test_billing_adjustment_is_skipped():
    assert should_skip_non_spend_row(
        14572.99,
        "העברת חיובים עקב שינוי מועד חיוב",
        None,
        transaction_type_he="רגילה",
    )
    assert should_skip_non_spend_row(
        -14572.99,
        "העברת חיובים עקב שינוי מועד חיוב",
        None,
        transaction_type_he="זיכוי",
    )


def test_card_fee_pending_is_skipped():
    assert should_skip_non_spend_row(None, "דמי כרטיס ויזה", None, transaction_type_he="דמי חבר")


def test_card_fee_final_is_kept():
    assert not should_skip_non_spend_row(12.88, "דמי כרטיס ויזה", None, transaction_type_he="דמי חבר")


def test_interest_row():
    charge, _, estimated = resolve_charge_ils(8.96, 0.21, "* ריבית *", None, tx_date=date(2026, 6, 17))
    assert charge == 0.21
    assert estimated is False


def test_refund_uses_negative_bank_charge():
    charge, currency, estimated = resolve_charge_ils(
        543,
        -543,
        "SKIMS US",
        None,
        tx_date=date(2026, 4, 12),
        transaction_type_he="זיכוי",
    )
    assert charge == -543
    assert currency == "ILS"
    assert estimated is False


def test_refund_from_negative_amount():
    charge, currency, estimated = resolve_charge_ils(
        -543,
        None,
        "SKIMS US",
        None,
        tx_date=date(2026, 4, 12),
        transaction_type_he="זיכוי",
    )
    assert charge == -543
    assert currency == "ILS"
    assert estimated is False


def test_refund_renormalizes_positive_stored_charge():
    charge, currency, estimated = resolve_charge_ils(
        543,
        543,
        "SKIMS US",
        None,
        tx_date=date(2026, 4, 12),
        transaction_type_he="זיכוי",
    )
    assert charge == -543
    assert currency == "ILS"
    assert estimated is False


def test_sale_return_refund_type():
    charge, currency, estimated = resolve_charge_ils(
        543,
        543,
        "SKIMS Galilot",
        None,
        tx_date=date(2026, 4, 2),
        transaction_type_he="השבת מכירה",
    )
    assert charge == -543
    assert currency == "ILS"
    assert estimated is False


def test_bgn_from_ratio():
    assert detect_currency("MAGAZIN ALKOHOL", 8.9, 17.96) == "BGN"
