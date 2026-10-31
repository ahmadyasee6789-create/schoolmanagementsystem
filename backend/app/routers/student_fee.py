# app/routers/fees.py
import math
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.academic_session import AcademicSession
from app.models.classroom import Classroom, Grade
from app.models.fee_structure import FeeStructure
from app.models.fee_transection import FeeTransaction
from app.models.student_enrollment import StudentEnrollment
from app.models.student_fee import StudentFee
from app.models.students import Student
from app.routers.auth import get_current_user
from app.routers.receptTemp import render_fee_receipt
from app.schemas.student_fee import PaymentCreate
from app.dependencies import get_active_session
from app.financial_permissions import require_financial_permission
from app.services.fee_collection import CENT, collect_fee_payment, lock_financial_organization, money

router = APIRouter(prefix="/fees", tags=["Fees"])

MONTH_TO_NUMBER = {
    "January": 1, "February": 2, "March": 3, "April": 4,
    "May": 5, "June": 6, "July": 7, "August": 8,
    "September": 9, "October": 10, "November": 11, "December": 12,
}
NUMBER_TO_MONTH = {v: k for k, v in MONTH_TO_NUMBER.items()}





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
        structure = db.query(FeeStructure).filter(
            FeeStructure.class_id == class_id,
            FeeStructure.organization_id == org_id,
            FeeStructure.session_id == active_session.id,
        ).populate_existing().first()
        if structure is None:
            raise HTTPException(404, "Fee structure not found for this class and session")
        # Validate all components, even when a charge is excluded this month.
        admission_fee = money(structure.admission_fee)
        monthly = money(structure.monthly_fee)
        exam_fee = money(structure.exam_fee)
        created = 0
        for student, enrollment in enrolled:
            existing = db.query(StudentFee.id).filter(
                StudentFee.student_id == student.id,
                StudentFee.month == month,
                StudentFee.session_id == active_session.id,
                StudentFee.organization_id == org_id,
            ).first()
            if existing:
                continue
            already_has_admission = db.query(StudentFee.id).filter(
                StudentFee.student_id == student.id,
                StudentFee.session_id == active_session.id,
                StudentFee.admission_fee > 0,
                StudentFee.organization_id == org_id,
            ).first()
            admission = admission_fee if not already_has_admission else Decimal("0.00")
            exam = exam_fee if include_exam_fee else Decimal("0.00")
            total = money(admission + monthly + exam)
            discount_percent = money(enrollment.discount_percent if enrollment.discount_percent is not None else 0)
            if discount_percent > 100:
                raise HTTPException(409, "Invalid enrollment discount; correct it before generating fees")
            # Currency is rounded once, to cents, using half-up rounding.
            discount_amount = (monthly * discount_percent / 100).quantize(CENT, rounding=ROUND_HALF_UP)
            final_amount = total - discount_amount
            db.add(StudentFee(
                class_id=class_id, student_id=student.id, organization_id=org_id,
                month=month, admission_fee=admission, monthly_fee=monthly,
                exam_fee=exam, total_amount=total, discount_percent=discount_percent,
                discount_amount=discount_amount, final_amount=final_amount,
                paid_amount=Decimal("0.00"), status="paid" if final_amount == 0 else "unpaid",
                session_id=active_session.id,
            ))
            created += 1
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
    transaction = db.query(FeeTransaction).join(StudentFee).join(Student).filter(
        FeeTransaction.id == transaction_id,
        FeeTransaction.organization_id == current_user.org_id,
        StudentFee.organization_id == current_user.org_id,
        Student.organization_id == current_user.org_id,
    ).first()
    if transaction is None:
        raise HTTPException(404, "Payment not found")
    fee = transaction.student_fee
    student = fee.student
    try:
        pdf = render_fee_receipt(
            fee=fee, transaction=transaction,
            student_name=f"{student.first_name} {student.last_name or ''}".strip(),
            org_name=student.organization.name,
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
            StudentFee.month == month,
            StudentFee.organization_id == current_user.org_id,
            StudentFee.session_id==active_session.id
        )
    )

    total = query.count()
    fees = query.order_by(StudentFee.id.desc()).offset((page - 1) * limit).limit(limit).all()

    items = []
    for fee in fees:
        student = fee.student
        if fee.paid_amount >= fee.final_amount:
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
            "total_amount": float(fee.total_amount),
            "final_amount": float(fee.final_amount),
            "paid_amount": float(fee.paid_amount),
            "due_amount": float(fee.final_amount - fee.paid_amount),
            "status": status,
        })

    return {
        "items": items,
        "total_pages": math.ceil(total / limit) if total else 1,
    }
