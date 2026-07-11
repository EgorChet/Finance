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
    assert parse_pending_currencies(rows, 1) == {313.82: "ILS", 469.4: "PLN"}


def test_pending_yalla_balagan_uses_ils_from_header():
    charge, currency, estimated = resolve_charge_ils(
        160,
        None,
        "nagalaB allaY",
        "עסקה בקליטה",
        tx_date=date(2026, 6, 29),
        explicit_currency="ILS",
    )
    assert charge == 160
    assert currency == "ILS"
    assert estimated is True


def test_parser_yalla_balagan_from_jun30_statement():
    from pathlib import Path
    from parser import parse_leumi_visa_xlsx

    path = Path(__file__).resolve().parents[3] / "local" / "statements" / "Partial"
    files = list(path.glob("*30.06.26*.xlsx"))
    assert files, "Jun 30 partial statement fixture missing"
    txs, meta = parse_leumi_visa_xlsx(files[0])
    assert meta["pending_currencies"]["160.0"] == "ILS"
    yalla = next(tx for tx in txs if "allaY" in tx.merchant_he)
    assert yalla.charge_amount == 160
    assert yalla.original_currency == "ILS"
    assert yalla.charge_estimated is True


def test_parser_metadata_includes_pending_currencies():
    import glob
    from pathlib import Path
    from parser import parse_leumi_visa_xlsx

    files = glob.glob(str(Path(__file__).resolve().parents[3] / "local" / "statements" / "*19.06.26*.xlsx"))
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


def test_pending_bit_merchant_with_il_suffix_is_ils():
    charge, currency, estimated = resolve_charge_ils(
        120,
        None,
        "BIT beit dagan IL",
        "עסקה בקליטה",
        tx_date=date(2026, 6, 21),
    )
    assert charge == 120
    assert currency == "ILS"
    assert estimated is True


def test_detect_currency_il_country_suffix():
    assert detect_currency("Some Shop IL", 50, None) == "ILS"


def test_pending_apple_ils_subscription_not_usd():
    """Israeli App Store bills in ₪ — pending 39.90 must not be treated as $39.90."""
    charge, currency, estimated = resolve_charge_ils(
        39.9,
        None,
        "APPLE.COM/BILL ITUNES.COM IE",
        "עסקה בקליטה",
        tx_date=date(2026, 6, 30),
    )
    assert charge == 39.9
    assert currency == "ILS"
    assert estimated is True


def test_pending_apple_corrects_stale_explicit_usd():
    """Re-normalize must fix rows saved with original_currency=USD before the Apple ILS fix."""
    charge, currency, estimated = resolve_charge_ils(
        39.9,
        None,
        "APPLE.COM/BILL ITUNES.COM IE",
        "עסקה בקליטה",
        tx_date=date(2026, 6, 30),
        explicit_currency="USD",
    )
    assert charge == 39.9
    assert currency == "ILS"
    assert estimated is True


@patch("fx.get_rate_to_ils", return_value=3.7)
def test_pending_apple_corrects_stale_usd_with_estimated_charge(_mock):
    charge, currency, estimated = resolve_charge_ils(
        39.9,
        147.63,
        "APPLE.COM/BILL ITUNES.COM IE",
        "עסקה בקליטה",
        tx_date=date(2026, 6, 30),
        explicit_currency="USD",
    )
    assert charge == 39.9
    assert currency == "ILS"
    assert estimated is True


def test_detect_currency_apple_usd_subscription():
    assert detect_currency("APPLE.COM/BILL ITUNES.COM IE", 39.99, None) == "USD"


def test_detect_currency_apple_ils_price_tier():
    assert detect_currency("APPLE.COM/BILL ITUNES.COM IE", 39.9, None) == "ILS"


def test_detect_currency_equal_amount_charge_is_ils_not_pln():
    """When amount equals bank charge, ratio ~1 must be ILS (not PLN band)."""
    assert detect_currency("ROY SWEETS", 11, 11) == "ILS"


def test_pending_english_israeli_merchant_is_ils():
    """Israeli shops with English names must not be treated as USD while pending."""
    charge, currency, estimated = resolve_charge_ils(
        11,
        None,
        "ROY SWEETS",
        "עסקה בקליטה",
        tx_date=date(2026, 7, 1),
    )
    assert charge == 11
    assert currency == "ILS"
    assert estimated is True


def test_pending_english_merchant_defaults_to_ils_without_header():
    """Pending rows without header currency fall back to merchant heuristics."""
    charge, currency, estimated = resolve_charge_ils(
        11,
        32.78,
        "ROY SWEETS",
        "עסקה בקליטה",
        tx_date=date(2026, 7, 1),
    )
    assert charge == 11
    assert currency == "ILS"
    assert estimated is True


def test_pending_cal_transaction_type_marks_pending():
    charge, currency, estimated = resolve_charge_ils(
        11,
        32.78,
        "ROY SWEETS",
        "pending",
        tx_date=date(2026, 7, 1),
        transaction_type_he="בתהליך קליטה",
    )
    assert charge == 11
    assert currency == "ILS"
    assert estimated is True


def test_detect_currency_honors_explicit_ils():
    assert detect_currency("APPLE.COM/BILL ITUNES.COM IE", 39.99, None, "ILS") == "ILS"


def test_parse_pending_currencies_comma_decimal_ils():
    rows = [
        ("עסקאות בתהליך קליטה 39,90 ₪",),
        ("תאריך", "שם בית עסק", "סכום"),
    ]
    assert parse_pending_currencies(rows, 1) == {39.9: "ILS"}


def test_parse_pending_currencies_dollar_symbol():
    rows = [
        ("עסקאות בתהליך קליטה 1,895.16 ₪ ובנוסף 75.00 $",),
        ("תאריך", "שם בית עסק", "סכום"),
    ]
    assert parse_pending_currencies(rows, 1) == {1895.16: "ILS", 75.0: "USD"}


@patch("fx.get_rate_to_ils", return_value=3.55)
def test_pending_aerohandling_usd_from_dollar_header(_mock):
    charge, currency, estimated = resolve_charge_ils(
        75,
        None,
        "אירוהנדלינג AEROHANDLING",
        "עסקה בקליטה",
        tx_date=date(2026, 7, 11),
        explicit_currency="USD",
    )
    assert currency == "USD"
    assert estimated is True
    assert charge == round(75 * 3.55, 2)


def test_parser_aerohandling_from_jul11_statement():
    from pathlib import Path
    from parser import parse_leumi_visa_xlsx

    path = Path(__file__).resolve().parents[3] / "local" / "statements" / "Partial"
    files = list(path.glob("*11.07.26*.xlsx"))
    assert files, "Jul 11 partial statement fixture missing"
    txs, meta = parse_leumi_visa_xlsx(files[0])
    assert meta["pending_currencies"]["75.0"] == "USD"
    aero = next(tx for tx in txs if "AEROHANDLING" in tx.merchant_he)
    assert aero.original_currency == "USD"
    assert aero.charge_estimated is True
    assert aero.charge_amount != 75


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


def test_refund_matches_bgn_booking_original_charge():
    from dataclasses import dataclass

    @dataclass
    class Tx:
        date: date
        merchant_he: str
        amount: float
        charge_amount: float
        original_currency: str | None = None
        charge_estimated: bool = False
        transaction_type_he: str | None = None

    merchant = "BKG*HOTEL AT BOOKING.C"
    txs = [
        Tx(date(2025, 12, 1), merchant, 2033.30, 4045.13, "BGN", False, "רגילה"),
        Tx(date(2025, 12, 5), merchant, 2033.30, -2033.30, "ILS", False, "זיכוי"),
    ]
    charge, currency, estimated = resolve_charge_ils(
        2033.30,
        -2033.30,
        merchant,
        None,
        tx_date=date(2025, 12, 5),
        transaction_type_he="זיכוי",
        transactions_for_matching=txs,
        skip_index=1,
    )
    assert charge == -4045.13
    assert currency == "BGN"
    assert estimated is False


@patch("fx.get_rate_to_ils", return_value=1.99)
def test_refund_fx_fallback_when_no_match(_mock):
    charge, currency, estimated = resolve_charge_ils(
        2033.30,
        -2033.30,
        "BKG*HOTEL AT BOOKING.C",
        None,
        tx_date=date(2025, 12, 5),
        transaction_type_he="זיכוי",
        explicit_currency="BGN",
    )
    assert charge == round(-2033.30 * 1.99, 2)
    assert currency == "BGN"
    assert estimated is True
