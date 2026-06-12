from dataclasses import dataclass
from datetime import date
from typing import Optional


@dataclass
class Transaction:
    date: date
    merchant_he: str
    amount: float
    charge_amount: float
    transaction_type_he: str
    category_he: Optional[str]
    notes: Optional[str]

    # Filled in by translator
    merchant_en: str = ""
    category_en: str = ""
    merchant_known: bool = False
    billing_month: Optional[str] = None
