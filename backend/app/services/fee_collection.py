"""Atomic, single-fee collections. PDF rendering is deliberately outside this service."""
from datetime import date, datetime
from decimal import Decimal
import hashlib
import json

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.financial_permissions import require_financial_permission
from app.models.fee_transection import FeeTransaction
from app.models.fee_collection_command import FeeCollectionCommand
from app.models.student_fee import StudentFee
from app.models.students import Student
from app.services.fee_locks import lock_financial_organization
from app.services.fee_amounts import CENT, MAX_MONEY, money
from app.services.fee_allocations import allocate_payment, reconciled_fee_balance

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


def single_fee_fingerprint(fee_id, amount):
    payload = {"v": 1, "operation": "single-fee", "fee_id": fee_id, "amount": format(amount, ".2f")}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def payment_response(transaction: FeeTransaction) -> dict:
    if transaction.response_snapshot is not None:
        return dict(transaction.response_snapshot)
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


def validate_idempotency_key(idempotency_key):
    if (not isinstance(idempotency_key, str) or not 8 <= len(idempotency_key) <= 128
            or not idempotency_key.isascii()
            or any(not (c.isalnum() or c in "-_.:") for c in idempotency_key)):
        raise HTTPException(422, "Idempotency-Key must contain 8–128 ASCII letters, digits, '-', '_', '.', or ':'")


def collect_fee_payment(db: Session, current_user, fee_id: int,
                        amount: Decimal, idempotency_key: str) -> dict:
    require_financial_permission(current_user, "collect_fees")
    validate_idempotency_key(idempotency_key)
    try:
        amount = money(amount, positive=True)
    except HTTPException as exc:
        raise HTTPException(422, "Payment must be a positive finite amount with at most two decimal places") from exc

    try:
        lock_financial_organization(db, current_user.org_id)
        if db.query(FeeCollectionCommand.id).filter_by(
                organization_id=current_user.org_id, idempotency_key=idempotency_key).first():
            raise HTTPException(409, "This Idempotency-Key was already used for a multi-month or credit operation")
        previous = db.query(FeeTransaction).filter(
            FeeTransaction.organization_id == current_user.org_id,
            FeeTransaction.idempotency_key == idempotency_key,
        ).populate_existing().first()
        if previous is not None:
            if (previous.student_fee_id != fee_id or previous.amount != amount
                    or (previous.request_fingerprint is not None
                        and previous.request_fingerprint != single_fee_fingerprint(fee_id, amount))):
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

        remaining = reconciled_fee_balance(db, fee)
        if amount > remaining:
            raise HTTPException(400, f"Payment exceeds remaining balance of {remaining:.2f}")

        paid_after = money(fee.paid_amount) + amount
        status_after = "paid" if amount == remaining else "partial"
        transaction = FeeTransaction(
            student_fee_id=fee.id, organization_id=current_user.org_id,
            student_id=fee.student_id, session_id=fee.session_id,
            amount=amount, payment_date=date.today(),
            receipt_no=generate_receipt_number(db, current_user.org_id),
            created_by=current_user.id, idempotency_key=idempotency_key,
            paid_amount_after=paid_after, fee_status_after=status_after,
            request_fingerprint=single_fee_fingerprint(fee_id, amount),
        )
        db.add(transaction)
        db.flush()
        allocate_payment(db, org_id=current_user.org_id, transaction_id=transaction.id,
                         fee_id=fee.id, amount=amount)
        # Capture the response before commit expires ORM objects. No post-commit
        # refresh/PDF dependency may turn a confirmed payment into an HTTP error.
        result = payment_response(transaction)
        transaction.response_snapshot = result
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
