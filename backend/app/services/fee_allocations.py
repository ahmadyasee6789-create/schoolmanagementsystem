"""Allocation accounting primitives, with no public collection API or commits.

All financial writers must acquire the organization lock first. Allocations are
append-only through these services; refunds/reversals need a separate reviewed design.
"""
from decimal import Decimal

from fastapi import HTTPException

from app.models.fee_allocation import FeeAllocation
from app.models.fee_transection import FeeTransaction
from app.models.student_fee import StudentFee
from app.models.fee_yearly_discount import FeeYearlyDiscount
from app.services.fee_amounts import money
from app.services.fee_locks import lock_financial_organization


def _allocated(db, column, record_id, owner):
    rows = db.query(FeeAllocation).filter(column == record_id).all()
    if any((row.organization_id, row.student_id, row.session_id) != owner for row in rows):
        raise HTTPException(409, "Allocation ownership needs reconciliation")
    return sum((money(row.amount, positive=True) for row in rows), Decimal("0.00"))


def remaining_credit(db, payment):
    """Derived from this receipt only; no second stored credit balance."""
    allocated = _allocated(db, FeeAllocation.transaction_id, payment.id,
                           (payment.organization_id, payment.student_id, payment.session_id))
    credit = money(payment.amount, positive=True) - allocated
    if credit < 0:
        raise HTTPException(409, "Payment allocations exceed the recorded payment")
    return credit


def yearly_discount_total(db, fee):
    return sum((money(row.amount, positive=True) for row in db.query(FeeYearlyDiscount).filter_by(student_fee_id=fee.id).all()), Decimal("0.00"))


def reconciled_fee_balance(db, fee):
    paid, final = money(fee.paid_amount), money(fee.final_amount)
    gross = sum((money(fee.admission_fee), money(fee.monthly_fee), money(fee.exam_fee)), Decimal(0))
    discount = money(fee.discount_amount)
    annual_discount = yearly_discount_total(db, fee)
    if (money(fee.discount_percent) > 100 or gross != money(fee.total_amount)
            or discount > gross or gross - discount != final or paid > final):
        raise HTTPException(409, "Fee breakdown needs reconciliation before collection")
    if annual_discount > min(final - paid, max(Decimal("0.00"), money(fee.monthly_fee) - discount)):
        raise HTTPException(409, "Yearly discount exceeds the remaining tuition balance")
    owner = (fee.organization_id, fee.student_id, fee.session_id)
    recorded = _allocated(db, FeeAllocation.student_fee_id, fee.id, owner)
    if recorded != paid:
        raise HTTPException(409, "Paid amount does not match allocation history; reconcile before collection")
    return final - paid - annual_discount


def allocate_payment(db, *, org_id, transaction_id, fee_id, amount):
    """Append an allocation and update the legacy paid projection in one transaction.

    Caller must lock the organization BEFORE inserting the payment, and must roll
    back the complete unit of work on any error. This function never commits.
    """
    lock_financial_organization(db, org_id)
    payment = db.query(FeeTransaction).filter_by(id=transaction_id, organization_id=org_id).populate_existing().with_for_update().first()
    fee = db.query(StudentFee).filter_by(id=fee_id, organization_id=org_id).populate_existing().with_for_update().first()
    if payment is None or fee is None:
        raise HTTPException(404, "Payment or fee not found")
    if (payment.student_id, payment.session_id) != (fee.student_id, fee.session_id):
        raise HTTPException(409, "Payment and fee must belong to the same student and session")
    amount = money(amount, positive=True)
    outstanding = reconciled_fee_balance(db, fee)
    if amount > outstanding:
        raise HTTPException(400, f"Payment exceeds remaining balance of {outstanding:.2f}")
    if amount > remaining_credit(db, payment):
        raise HTTPException(409, "Allocation exceeds the payment's remaining credit")
    allocation = FeeAllocation(
        organization_id=org_id, student_id=fee.student_id, session_id=fee.session_id,
        transaction_id=payment.id, student_fee_id=fee.id, amount=amount,
    )
    fee.paid_amount = money(fee.paid_amount) + amount
    fee.status = "paid" if amount == outstanding else "partial"
    db.add(allocation)
    db.flush()
    return allocation
