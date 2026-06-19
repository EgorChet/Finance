from datetime import date
from unittest.mock import patch

from fx import detect_currency, resolve_charge_ils
from parser import parse_pending_currencies


def test_cursor_usd_uses_bank_ils_charge():
    charge, currency, estimated = resolve_charge_ils(
        8.96, 31.14, "CURSOR, AI POWERED IDE", None, tx_date=date(2026, 6, 17)
    )
    assert charge == 31.14
    assert currency == "USD"
    assert estimated is False


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


def test_interest_row():
    charge, _, estimated = resolve_charge_ils(8.96, 0.21, "* ריבית *", None, tx_date=date(2026, 6, 17))
    assert charge == 0.21
    assert estimated is False


def test_bgn_from_ratio():
    assert detect_currency("MAGAZIN ALKOHOL", 8.9, 17.96) == "BGN"
