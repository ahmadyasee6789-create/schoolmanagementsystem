# app/routers/fees.py
import math

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from sqlalchemy import and_
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.academic_session import AcademicSession
from app.models.classroom import Classroom, Grade
from app.models.fee_transection import FeeTransaction
from app.models.fee_yearly_discount import FeeYearlyDiscount
from app.models.student_enrollment import StudentEnrollment
from app.models.student_fee import StudentFee
from app.models.students import Student
from app.routers.auth import get_current_user
from app.routers.receptTemp import render_fee_receipt
from app.schemas.student_fee import PaymentCreate
from app.dependencies import get_active_session
from app.financial_permissions import require_financial_permission
from app.services.fee_collection import collect_fee_payment, lock_financial_organization
from app.services.billing_periods import MONTH_TO_NUMBER, NUMBER_TO_MONTH, resolve_legacy_month
from app.services.monthly_fees import get_or_create_monthly_fee
from app.schemas.fee_collection import (CollectionPreviewRequest, CollectionPreviewResponse,
                                        CollectionRequest, CollectionResponse, ReceiptInfo)
from app.services.multi_fee_collection import preview_collection, collect_multi
from app.services.fee_reads import (scoped_payment, payment_info, receipt_info,
                                    student_fee_history, student_payments)
from app.services.school_logo import organization_logo
from app.routers.receptTemp import render_multi_fee_receipt

router = APIRouter(prefix="/fees", tags=["Fees"])


@router.post("/collection/preview", response_model=CollectionPreviewResponse)
def preview_multi_collection(request: CollectionPreviewRequest, db: Session = Depends(get_db),
                             current_user=Depends(get_current_user)):
    return preview_collection(db, current_user, request)


@router.post("/collection/multi", response_model=CollectionResponse)
def collect_multi_payment(request: CollectionRequest, db: Session = Depends(get_db),
                          current_user=Depends(get_current_user),
                          idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128)):
    return collect_multi(db, current_user, request, idempotency_key)


@router.get("/students/{student_id}/history")
def get_student_fee_history(student_id: int, session_id: int | None = Query(None, gt=0),
                            page: int = Query(1, ge=1), limit: int = Query(100, ge=1, le=200),
                            db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return student_fee_history(db, current_user, student_id, session_id, page, limit)


@router.get("/students/{student_id}/payments")
def get_student_payments(student_id: int, session_id: int | None = Query(None, gt=0),
                         page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200),
                         db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return student_payments(db, current_user, student_id, session_id, page, limit)


@router.get("/payments/{transaction_id}")
def get_payment_details(transaction_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return payment_info(db, current_user, scoped_payment(db, current_user, transaction_id))


@router.get("/payments/{transaction_id}/receipt-info", response_model=ReceiptInfo)
def get_receipt_info(transaction_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return receipt_info(db, current_user, transaction_id)

def get_enrolled_students(class_id: int, org_id: int, db: Session,
                          active_session):
    """Return list of (Student, StudentEnrollment) for a class."""
    return (
        db.query(Student, StudentEnrollment)
        .join(StudentEnrollment, Student.id == StudentEnrollment.student_id)
        .filter(
            StudentEnrollment.classroom_id == class_id,
            StudentEnrollment.is_active == True,
            StudentEnrollment.session_id == active_session.id,   
            Student.organization_id == org_id,
            Student.is_active == True,
        )
        .all()
    )


# -------------------------------------------------------------------
# GENERATE MONTHLY FEES
# -------------------------------------------------------------------
@router.post("/generate")
def generate_monthly_fees(
    class_id: int,
    month: str,
    include_exam_fee: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    active_session=Depends(get_active_session)
):
    require_financial_permission(current_user, "generate_fees")
    org_id = current_user.org_id
    if month not in MONTH_TO_NUMBER:
        raise HTTPException(400, "Invalid month name")

    try:
        lock_financial_organization(db, org_id)
        classroom = db.query(Classroom).join(Grade).filter(
            Classroom.id == class_id, Classroom.organization_id == org_id,
            Grade.organization_id == org_id,
            Classroom.academic_year_id == active_session.id,
        ).first()
        session = db.query(AcademicSession).filter(
            AcademicSession.id == active_session.id,
            AcademicSession.organization_id == org_id,
        ).first()
        if classroom is None or session is None:
            raise HTTPException(404, "Classroom or academic session not found")
        enrolled = get_enrolled_students(class_id, org_id, db, active_session)
        if not enrolled:
            raise HTTPException(404, "No enrolled students found for this class")
        try:
            period = resolve_legacy_month(month, session.start_date, session.end_date)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        created = 0
        for student, enrollment in enrolled:
            _, is_new = get_or_create_monthly_fee(
                db, org_id=org_id, student_id=student.id, session_id=session.id,
                period=period, include_exam_fee=include_exam_fee,
            )
            created += int(is_new)
        result = {"message": f"{created} fees generated for {month} in session {session.name}"}
        db.commit()
        return result
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Fee generation conflicted with another operation; retry the request") from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(503, "Fee generation could not be confirmed; retry the request") from exc


@router.post("/{fee_id}/collect")
def collect_payment(
    fee_id: int,
    payment: PaymentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128),
):
    return collect_fee_payment(db, current_user, fee_id, payment.amount, idempotency_key)


@router.get("/payments/{transaction_id}/receipt")
def download_payment_receipt(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_financial_permission(current_user, "view_fees")
    transaction = scoped_payment(db, current_user, transaction_id)
    fee = transaction.student_fee
    try:
        if fee is not None:
            student = fee.student
            pdf = render_fee_receipt(
                fee=fee, transaction=transaction,
                student_name=f"{student.first_name} {student.last_name or ''}".strip(),
                org_name=student.organization.name,
            )
        else:
            pdf = render_multi_fee_receipt(
                receipt_info(db, current_user, transaction_id),
                logo_image=organization_logo(transaction.organization),
            )
    except Exception as exc:
        # Rendering is read-only and can be retried without collecting again.
        raise HTTPException(503, "Receipt generation failed. The recorded payment is unchanged; retry this receipt download.") from exc
    return Response(pdf, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="payment-{transaction.id}.pdf"',
        "Cache-Control": "private, no-store",
    })


# -------------------------------------------------------------------
# FEE LEDGER
# -------------------------------------------------------------------
@router.get("/ledger")
def get_fee_ledger(
    class_id: int,
    month: str,
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    active_session=Depends(get_active_session)
):
    require_financial_permission(current_user, "view_fees")
    try:
        period = resolve_legacy_month(month, active_session.start_date, active_session.end_date)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    query = (
        db.query(StudentFee)
        .join(Student, StudentFee.student_id == Student.id)
        .join(StudentEnrollment, StudentEnrollment.student_id == Student.id)
        .filter(
            StudentEnrollment.classroom_id == class_id,
            StudentEnrollment.is_active == True,
            StudentEnrollment.session_id == active_session.id,
            StudentFee.class_id == class_id,
            Student.organization_id == current_user.org_id,
            StudentFee.billing_period == period,
            StudentFee.organization_id == current_user.org_id,
            StudentFee.session_id==active_session.id
        )
    )

    total = query.count()
    fees = (
        query.add_columns(FeeYearlyDiscount.amount)
        .outerjoin(FeeYearlyDiscount, and_(
            FeeYearlyDiscount.student_fee_id == StudentFee.id,
            FeeYearlyDiscount.organization_id == StudentFee.organization_id,
            FeeYearlyDiscount.student_id == StudentFee.student_id,
            FeeYearlyDiscount.session_id == StudentFee.session_id,
        ))
        .order_by(StudentFee.id.desc()).offset((page - 1) * limit).limit(limit).all()
    )

    items = []
    for fee, yearly_discount in fees:
        student = fee.student
        yearly_discount = yearly_discount or 0
        # The issued charge is immutable. Project its net settlement after the
        # separate yearly adjustment, while keeping paid_amount as allocations.
        final_amount = fee.final_amount - yearly_discount
        due_amount = final_amount - fee.paid_amount
        if due_amount <= 0:
            status = "paid"
        elif fee.paid_amount > 0:
            status = "partial"
        else:
            status = "unpaid"

        items.append({
            "id": fee.id,
            "student_name": f"{student.first_name} {student.last_name or ''}".strip(),
            "month": fee.month,
            "admission_fee": float(fee.admission_fee),
            "monthly_fee": float(fee.monthly_fee),
            "exam_fee": float(fee.exam_fee),
            "discount_percent": float(fee.discount_percent or 0),
            "discount_amount": float(fee.discount_amount),
            "yearly_discount_amount": float(yearly_discount),
            "total_amount": float(fee.total_amount),
            "final_amount": float(final_amount),
            "paid_amount": float(fee.paid_amount),
            "due_amount": float(due_amount),
            "status": status,
        })

    return {
        "items": items,
        "total_pages": math.ceil(total / limit) if total else 1,
    }
