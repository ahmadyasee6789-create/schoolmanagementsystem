"""Exact currency validation shared by charge and allocation services."""
from decimal import Decimal, InvalidOperation

from fastapi import HTTPException

CENT = Decimal("0.01")
MAX_MONEY = Decimal("999999999999.99")


def money(value, *, positive=False) -> Decimal:
    """Reject invalid stored/request amounts instead of silently repairing money."""
    try:
        if isinstance(value, bool) or value is None:
            raise ValueError
        amount = Decimal(str(value))
        if not amount.is_finite() or amount < 0 or amount > MAX_MONEY:
            raise ValueError
        if amount != amount.quantize(CENT) or (positive and amount == 0):
            raise ValueError
        return amount.quantize(CENT)
    except (ValueError, TypeError, InvalidOperation) as exc:
        raise HTTPException(409, "Invalid fee amounts. Reconcile this record before collecting payment.") from exc
