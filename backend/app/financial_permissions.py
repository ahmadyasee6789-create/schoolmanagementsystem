"""Explicit backend permissions for fee data and financial mutations."""
from decimal import Decimal, InvalidOperation

from fastapi import HTTPException


FINANCE_ROLES = frozenset({"admin", "manager", "accountant"})
FINANCIAL_PERMISSIONS = {
    "view_fees": FINANCE_ROLES,
    "generate_fees": FINANCE_ROLES,
    "collect_fees": FINANCE_ROLES,
    "grant_discounts": frozenset({"admin", "manager"}),
    "manage_fee_structures": frozenset({"admin"}),
}


def has_financial_permission(current_user, action: str) -> bool:
    return getattr(current_user, "org_role", None) in FINANCIAL_PERMISSIONS.get(action, ())


def require_financial_permission(current_user, action: str) -> None:
    if not has_financial_permission(current_user, action):
        raise HTTPException(status_code=403, detail="You do not have permission for this financial operation")


def require_discount_access(current_user, discount_percent) -> None:
    """Student writers may enroll without a discount; concessions need approval roles."""
    try:
        discount = Decimal(str(discount_percent))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise HTTPException(status_code=422, detail="Discount must be between 0 and 100") from exc
    if isinstance(discount_percent, bool) or not discount.is_finite() or not 0 <= discount <= 100:
        raise HTTPException(status_code=422, detail="Discount must be between 0 and 100")
    if discount != discount.quantize(Decimal("0.01")):
        raise HTTPException(status_code=422, detail="Discount must have at most two decimal places")
    if discount:
        require_financial_permission(current_user, "grant_discounts")
