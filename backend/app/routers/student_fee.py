# app/routers/fees.py
import math
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.academic_session import AcademicSession
from app.models.fee_structure import FeeStructure
from app.models.fee_transection import FeeTransaction
from app.models.student_enrollment import StudentEnrollment
from app.models.student_fee import StudentFee
from app.models.students import Student
from app.routers.auth import get_current_user
from app.routers.receptTemp import create_fee_receipt
from app.schemas.student_fee import PaymentCreate
from app.dependencies import get_active_session

router = APIRouter(prefix="/fees", tags=["Fees"])

MONTH_TO_NUMBER = {
    "January": 1, "February": 2, "March": 3, "April": 4,
    "May": 5, "June": 6, "July": 7, "August": 8,
    "September": 9, "October": 10, "November": 11, "December": 12,
}
NUMBER_TO_MONTH = {v: k for k, v in MONTH_TO_NUMBER.items()}





def generate_receipt_number(db: Session, organization_id: int) -> str:
    year = datetime.now().year
    last_txn = (
        db.query(FeeTransaction)
        .filter(
            FeeTransaction.organization_id == organization_id,
            FeeTransaction.receipt_no.like(f"%{year}%"),
        )
        .order_by(FeeTransaction.id.desc())
        .first()
    )
    last_number = int(last_txn.receipt_no.split("-")[-1]) if last_txn and last_txn.receipt_no else 0
    return f"REC-{year}-{str(last_number + 1).zfill(4)}"


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
    org_id = current_user.org_id

    month_number = MONTH_TO_NUMBER.get(month)
    if not month_number:
        raise HTTPException(400, "Invalid month name")

    # Get students via enrollments
    enrolled = get_enrolled_students(class_id, org_id, db,active_session)
    if not enrolled:
        raise HTTPException(404, "No enrolled students found for this class")

    # Get fee structure
    structure = db.query(FeeStructure).filter(
        FeeStructure.class_id == class_id,
        FeeStructure.organization_id == org_id,
        FeeStructure.session_id == active_session.id,
    ).first()
    if not structure:
        raise HTTPException(404, "Fee structure not found for this class and session")

    created = 0

    for student, enrollment in enrolled:
        # Skip if fee already generated for this month
        existing = db.query(StudentFee).filter(
            StudentFee.student_id == student.id,
            StudentFee.month == month,
            StudentFee.session_id == active_session.id,
            StudentFee.organization_id == org_id,
        ).first()
        if existing:
            continue

        # Admission fee only once per session per student
        already_has_admission = db.query(StudentFee).filter(
            StudentFee.student_id == student.id,
            StudentFee.session_id == active_session.id,
            StudentFee.admission_fee > 0,
            StudentFee.organization_id == org_id,
        ).first()

        admission = Decimal(str(structure.admission_fee)) if not already_has_admission else Decimal(0)
        monthly = Decimal(str(structure.monthly_fee))
        exam = Decimal(str(structure.exam_fee)) if include_exam_fee else Decimal(0)
        total = admission + monthly + exam

        discount_percent = Decimal(str(enrollment.discount_percent or 0))
        discount_amount = (monthly * discount_percent) / 100
        final_amount = total - discount_amount

        fee = StudentFee(
            class_id=class_id,
            student_id=student.id,
            organization_id=org_id,
            month=month,
            admission_fee=admission,
            monthly_fee=monthly,
            exam_fee=exam,
            total_amount=total,
            discount_percent=enrollment.discount_percent,
            discount_amount=discount_amount,
            final_amount=final_amount,
            paid_amount=Decimal(0),
            status="unpaid",
            session_id=active_session.id,
        )
        db.add(fee)
        created += 1

    db.commit()
    return {"message": f"{created} fees generated for {month} in session {active_session.name}"}


# -------------------------------------------------------------------
# COLLECT PAYMENT
# -------------------------------------------------------------------
@router.post("/{fee_id}/collect")
def collect_payment(
    fee_id: int,
    payment: PaymentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),

):
    fee = db.query(StudentFee).filter(
        StudentFee.id == fee_id,
        StudentFee.organization_id == current_user.org_id,
    ).first()
    if not fee:
        raise HTTPException(404, "Fee not found")

    if payment.amount <= 0:
        raise HTTPException(400, "Payment amount must be greater than zero")

    remaining = fee.final_amount - fee.paid_amount
    if Decimal(str(payment.amount)) > remaining:
        raise HTTPException(400, f"Payment exceeds remaining balance of {float(remaining)}")

    fee.paid_amount += Decimal(str(payment.amount))
    fee.status = "paid" if fee.paid_amount >= fee.final_amount else "partial"

    receipt_no = generate_receipt_number(db, current_user.org_id)
    transaction = FeeTransaction(
        student_fee_id=fee.id,
        organization_id=fee.organization_id,
        amount=payment.amount,
        payment_date=date.today(),
        receipt_no=receipt_no,
        created_by=current_user.id,
    )

    try:
        db.add(transaction)
        db.commit()
        db.refresh(fee)
        db.refresh(transaction)
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Failed to process payment: {str(e)}")

    student = fee.student
    student_name = f"{student.first_name} {student.last_name}"
    org_name = student.organization.name if hasattr(student, "organization") else ""

    pdf_file = create_fee_receipt(
        fee=fee,
        transaction=transaction,
        student_name=student_name,
        org_name=org_name,
    )

    return {
        "fee_id": fee.id,
        "receipt_no": receipt_no,
        "status": fee.status,
        "paid_amount": float(fee.paid_amount),
        "receipt_pdf": pdf_file,
    }


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
    query = (
        db.query(StudentFee)
        .join(Student, StudentFee.student_id == Student.id)
        .join(StudentEnrollment, StudentEnrollment.student_id == Student.id)
        .filter(
            StudentEnrollment.classroom_id == class_id,
            StudentEnrollment.is_active == True,
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
            "student_name": f"{student.first_name} {student.last_name}",
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