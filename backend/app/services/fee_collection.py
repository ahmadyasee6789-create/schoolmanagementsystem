"""Atomic, single-fee collections. PDF rendering is deliberately outside this service."""
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.financial_permissions import require_financial_permission
from app.models.fee_transection import FeeTransaction
from app.models.student_fee import StudentFee
from app.models.students import Student
from app.models.users import Organization

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


def lock_financial_organization(db: Session, org_id: int):
    """One ordering for generation, request keys and receipt sequences per school.

    This intentionally serializes financial writes within one organization. It
    avoids another counter/reservation table in Phase 1. Never use skip_locked.
    """
    organization = db.query(Organization).filter(Organization.id == org_id).with_for_update().first()
    if organization is None:
        raise HTTPException(403, "An organization membership is required")
    return organization


def generate_receipt_number(db: Session, organization_id: int) -> str:
    """Call only while holding lock_financial_organization in this transaction."""
    prefix = f"REC-{datetime.now().year}-"
    # Existing references can contain gaps or have been imported out of ID order.
    numbers = db.query(FeeTransaction.receipt_no).filter(
        FeeTransaction.organization_id == organization_id,
        FeeTransaction.receipt_no.startswith(prefix),
    ).all()
    suffixes = [int(number[len(prefix):]) for (number,) in numbers
                if number[len(prefix):].isascii() and number[len(prefix):].isdigit()]
    return f"{prefix}{max(suffixes, default=0) + 1:04d}"


def payment_response(transaction: FeeTransaction) -> dict:
    return {
        "fee_id": transaction.student_fee_id,
        "transaction_id": transaction.id,
        "receipt_no": transaction.receipt_no,
        "status": transaction.fee_status_after,
        "paid_amount": float(transaction.paid_amount_after),
        # Keep the existing response key; documents are now fetched separately.
        "receipt_pdf": None,
        "receipt_url": f"/fees/payments/{transaction.id}/receipt",
    }


def collect_fee_payment(db: Session, current_user, fee_id: int,
                        amount: Decimal, idempotency_key: str) -> dict:
    require_financial_permission(current_user, "collect_fees")
    if (not isinstance(idempotency_key, str) or not 8 <= len(idempotency_key) <= 128
            or not idempotency_key.isascii()
            or any(not (c.isalnum() or c in "-_.:") for c in idempotency_key)):
        raise HTTPException(422, "Idempotency-Key must contain 8–128 ASCII letters, digits, '-', '_', '.', or ':'")
    try:
        amount = money(amount, positive=True)
    except HTTPException as exc:
        raise HTTPException(422, "Payment must be a positive finite amount with at most two decimal places") from exc

    try:
        lock_financial_organization(db, current_user.org_id)
        previous = db.query(FeeTransaction).filter(
            FeeTransaction.organization_id == current_user.org_id,
            FeeTransaction.idempotency_key == idempotency_key,
        ).populate_existing().first()
        if previous is not None:
            if previous.student_fee_id != fee_id or previous.amount != amount:
                raise HTTPException(409, "This Idempotency-Key was already used for a different payment")
            result = payment_response(previous)
            db.commit()  # Release the organization lock, including on replay.
            return result

        fee = db.query(StudentFee).filter(
            StudentFee.id == fee_id,
            StudentFee.organization_id == current_user.org_id,
        ).populate_existing().with_for_update().first()
        if fee is None:
            raise HTTPException(404, "Fee not found")
        student = db.query(Student.id).filter(
            Student.id == fee.student_id,
            Student.organization_id == current_user.org_id,
        ).first()
        if student is None:
            raise HTTPException(409, "Fee ownership needs correction before collection")

        final = money(fee.final_amount)
        paid = money(fee.paid_amount)
        if money(fee.discount_percent) > 100:
            raise HTTPException(409, "Fee discount needs reconciliation before collection")
        gross = sum((money(fee.admission_fee), money(fee.monthly_fee), money(fee.exam_fee)), Decimal(0))
        discount = money(fee.discount_amount)
        if gross != money(fee.total_amount) or discount > gross or gross - discount != final or paid > final:
            raise HTTPException(409, "Fee breakdown needs reconciliation before collection")
        # All current transactions are valid collections; reversals are a later phase.
        transactions = db.query(FeeTransaction).filter(FeeTransaction.student_fee_id == fee.id).all()
        if any(t.organization_id != current_user.org_id for t in transactions):
            raise HTTPException(409, "Payment ownership needs reconciliation before collection")
        recorded = sum((money(t.amount, positive=True) for t in transactions), Decimal(0))
        if recorded != paid:
            raise HTTPException(409, "Paid amount does not match transaction history; reconcile before collection")
        remaining = final - paid
        if amount > remaining:
            raise HTTPException(400, f"Payment exceeds remaining balance of {remaining:.2f}")

        fee.paid_amount = paid + amount
        fee.status = "paid" if fee.paid_amount == final else "partial"
        transaction = FeeTransaction(
            student_fee_id=fee.id, organization_id=current_user.org_id,
            amount=amount, payment_date=date.today(),
            receipt_no=generate_receipt_number(db, current_user.org_id),
            created_by=current_user.id, idempotency_key=idempotency_key,
            paid_amount_after=fee.paid_amount, fee_status_after=fee.status,
        )
        db.add(transaction)
        db.flush()
        # Capture the response before commit expires ORM objects. No post-commit
        # refresh/PDF dependency may turn a confirmed payment into an HTTP error.
        result = payment_response(transaction)
        db.commit()
        return result
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Payment conflicted with another operation. Retry with the same Idempotency-Key.") from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(503, "Payment could not be confirmed. Retry with the same Idempotency-Key.") from exc
