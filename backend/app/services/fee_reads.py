"""Organization-scoped read models. Receipts never collect or allocate money."""
from decimal import Decimal
from fastapi import HTTPException
from app.financial_permissions import require_financial_permission
from app.models.academic_session import AcademicSession
from app.models.fee_allocation import FeeAllocation
from app.models.fee_transection import FeeTransaction
from app.models.student_fee import StudentFee
from app.models.students import Student
from app.schemas.fee_collection import ReceiptInfo
from app.services.fee_allocations import remaining_credit, reconciled_fee_balance, yearly_discount_total
from app.services.multi_fee_collection import fee_line, class_names


def scoped_student(db, user, student_id, session_id=None):
    require_financial_permission(user, "view_fees")
    student = db.query(Student).filter_by(id=student_id, organization_id=user.org_id).first()
    if student is None:
        raise HTTPException(404, "Student not found")
    if session_id is not None and not db.query(AcademicSession.id).filter_by(id=session_id, organization_id=user.org_id).first():
        raise HTTPException(404, "Academic session not found")
    return student


def scoped_payment(db, user, transaction_id):
    require_financial_permission(user, "view_fees")
    payment = db.query(FeeTransaction).filter_by(id=transaction_id, organization_id=user.org_id).first()
    if payment is None:
        raise HTTPException(404, "Payment not found")
    scoped_student(db, user, payment.student_id, payment.session_id)
    return payment


def payment_info(db, user, payment):
    allocations = db.query(FeeAllocation, StudentFee).join(StudentFee, FeeAllocation.student_fee_id == StudentFee.id).filter(
        FeeAllocation.transaction_id == payment.id, FeeAllocation.organization_id == user.org_id,
        StudentFee.organization_id == user.org_id,
    ).order_by(FeeAllocation.id).all()
    credit = remaining_credit(db, payment)
    return dict(transaction_id=payment.id, student_id=payment.student_id, session_id=payment.session_id,
                receipt_no=payment.receipt_no, payment_date=payment.payment_date.isoformat(),
                amount=format(payment.amount, ".2f"), available_credit=format(credit, ".2f"),
                status="advance_credit" if credit else "fully_allocated",
                receipt_url=f"/fees/payments/{payment.id}/receipt",
                payment_method=(payment.response_snapshot or {}).get("receipt", {}).get("payment_method"),
                allocations=[dict(allocation_id=a.id, fee_id=f.id, billing_period=f.billing_period.strftime("%Y-%m"),
                                  amount=format(a.amount, ".2f"), applied_at=a.created_at.isoformat()) for a, f in allocations])


def student_fee_history(db, user, student_id, session_id=None, page=1, limit=100):
    scoped_student(db, user, student_id, session_id)
    fees = db.query(StudentFee).filter_by(organization_id=user.org_id, student_id=student_id)
    payments = db.query(FeeTransaction).filter_by(organization_id=user.org_id, student_id=student_id)
    if session_id is not None:
        fees, payments = fees.filter_by(session_id=session_id), payments.filter_by(session_id=session_id)
    all_fees = fees.order_by(StudentFee.billing_period, StudentFee.id).all()
    sessions = {}
    for fee in all_fees:
        balance = reconciled_fee_balance(db, fee)
        annual_discount = yearly_discount_total(db, fee)
        sessions.setdefault(fee.session_id, {"billed": Decimal(0), "paid": Decimal(0), "outstanding": Decimal(0),
                                            "overdue": Decimal(0), "available_credit": Decimal(0), "cash_received": Decimal(0)})
        totals = sessions[fee.session_id]
        totals["billed"] += fee.final_amount
        totals["paid"] += fee.paid_amount
        totals["outstanding"] += balance
        totals.setdefault("yearly_discount", Decimal(0))
        totals["yearly_discount"] += annual_discount
        if fee_line(fee, yearly_discount_amount=annual_discount)["overdue"]:
            totals["overdue"] += balance
    for payment in payments.all():
        totals = sessions.setdefault(payment.session_id, {"billed": Decimal(0), "paid": Decimal(0), "outstanding": Decimal(0),
                                                         "overdue": Decimal(0), "available_credit": Decimal(0), "cash_received": Decimal(0), "yearly_discount": Decimal(0)})
        totals["available_credit"] += remaining_credit(db, payment)
        totals["cash_received"] += payment.amount
    session_rows = db.query(AcademicSession).filter(AcademicSession.id.in_(sessions), AcademicSession.organization_id == user.org_id).all()
    names = {s.id: s.name for s in session_rows}
    return dict(student_id=student_id, total=len(all_fees), page=page, limit=limit,
                items=[fee_line(f, yearly_discount_amount=yearly_discount_total(db, f)) for f in all_fees[(page-1)*limit:page*limit]],
                sessions=[dict(session_id=sid, session_name=names[sid],
                               **{key: format(value, ".2f") for key, value in totals.items()},
                               credit_status="advance_credit" if totals["available_credit"] else None)
                          for sid, totals in sorted(sessions.items())])


def student_payments(db, user, student_id, session_id=None, page=1, limit=50):
    scoped_student(db, user, student_id, session_id)
    query = db.query(FeeTransaction).filter_by(organization_id=user.org_id, student_id=student_id)
    if session_id is not None:
        query = query.filter_by(session_id=session_id)
    total = query.count()
    rows = query.order_by(FeeTransaction.payment_date.desc(), FeeTransaction.id.desc()).offset((page-1)*limit).limit(limit).all()
    return dict(student_id=student_id, total=total, page=page, limit=limit, items=[payment_info(db, user, p) for p in rows])


def receipt_info(db, user, transaction_id):
    payment = scoped_payment(db, user, transaction_id)
    snapshot = payment.response_snapshot or {}
    if snapshot.get("collection_version") == 2:
        return ReceiptInfo(**snapshot["receipt"]).model_dump(mode="json")
    # Legacy records have no historical multi-fee snapshot. Label current balances
    # honestly; the legacy PDF renderer remains unchanged.
    student = scoped_student(db, user, payment.student_id, payment.session_id)
    session = db.get(AcademicSession, payment.session_id)
    allocations = db.query(FeeAllocation, StudentFee).join(StudentFee, FeeAllocation.student_fee_id == StudentFee.id).filter(
        FeeAllocation.transaction_id == payment.id, FeeAllocation.organization_id == user.org_id,
        StudentFee.organization_id == user.org_id).order_by(FeeAllocation.id).all()
    return ReceiptInfo(transaction_id=payment.id, receipt_no=payment.receipt_no, school_name=student.organization.name,
                       student_name=f"{student.first_name} {student.last_name or ''}".strip(), student_id=student.id,
                       session_id=session.id, session_name=session.name, payment_date=payment.payment_date,
                       class_names=class_names(db, user.org_id, {f.class_id for _, f in allocations}),
                       payment_method=None, cash_received=payment.amount,
                       allocations=[dict(fee_id=f.id, billing_period=f.billing_period.strftime("%Y-%m"),
                                         transaction_id=payment.id, source="cash", amount=a.amount, allocation_id=a.id) for a, f in allocations],
                       obligations=[fee_line(f, yearly_discount_amount=yearly_discount_total(db, f)) for f in {f.id: f for _, f in allocations}.values()],
                       remaining_advance_credit=remaining_credit(db, payment), balance_basis="current_legacy").model_dump(mode="json")
