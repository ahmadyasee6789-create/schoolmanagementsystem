from collections import defaultdict
from datetime import date
from decimal import Decimal, InvalidOperation
from io import BytesIO

from fastapi import Depends, HTTPException, Query, APIRouter
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.db.session import get_db
from app.dependencies import get_active_session
from app.financial_permissions import require_financial_permission
from app.models.student_fee import StudentFee
from app.models.fee_yearly_discount import FeeYearlyDiscount
from app.models.classroom import Classroom
from app.models.students import Student
from app.models.student_enrollment import StudentEnrollment
from app.routers.auth import get_current_user
from app.services.fee_voucher_generator import generate_fee_voucher, generate_fee_vouchers
from app.services.school_logo import organization_logo
from app.services.billing_periods import MONTH_TO_NUMBER, resolve_legacy_month, validate_period
router = APIRouter(tags=["Fee Voucher"])


def _fee_decimal(value) -> Decimal:
    try:
        amount = Decimal(str(value if value is not None else 0)).quantize(Decimal("0.01"))
        if not amount.is_finite() or amount < 0:
            raise ValueError("Invalid fee amount")
        return amount
    except (InvalidOperation, ValueError) as exc:
        raise HTTPException(status_code=409, detail="Fee amounts need correction before issuing a voucher") from exc


def _checked_period(fee, session):
    if MONTH_TO_NUMBER.get(fee.month) != getattr(fee.billing_period, "month", None):
        raise ValueError("Fee month label does not match its billing period")
    return validate_period(fee.billing_period, session.start_date, session.end_date)


def _voucher_classroom(db, class_id, org_id, session_id):
    classroom = (
        db.query(Classroom)
        .options(joinedload(Classroom.grade))
        .filter(Classroom.id == class_id, Classroom.organization_id == org_id,
                Classroom.academic_year_id == session_id)
        .first()
    )
    if classroom is None or classroom.grade is None or classroom.grade.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Fee classroom not found in the active session")
    return classroom


def _voucher_payload(fee, classroom, active_session, org_id, due_date, previous_fees):
    """Build the same validated amounts and student details for single and bulk PDFs."""
    if _fee_decimal(fee.paid_amount) > 0:
        raise HTTPException(
            status_code=409,
            detail="Vouchers can only be issued before payment. This fee already has a recorded payment.",
        )

    student = fee.student
    if student is None or student.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Student not found")

    try:
        target_period = _checked_period(fee, active_session)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    arrears = Decimal("0")
    for old_fee, yearly_discount in previous_fees:
        try:
            is_earlier = _checked_period(old_fee, active_session) < target_period
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        if is_earlier:
            outstanding = (_fee_decimal(old_fee.final_amount) - _fee_decimal(old_fee.paid_amount)
                           - _fee_decimal(yearly_discount or 0))
            arrears += max(Decimal("0"), outstanding)

    fee_items = [
        {"description": "Monthly Tuition Fee", "amount": _fee_decimal(fee.monthly_fee)},
        {"description": "Admission Fee", "amount": _fee_decimal(fee.admission_fee)},
        {"description": "Examination Fee", "amount": _fee_decimal(fee.exam_fee)},
    ]
    fee_items = [item for item in fee_items if item["amount"] > 0]
    if not fee_items:
        fee_items = [{"description": "School Fees", "amount": Decimal("0")}]
    discount = _fee_decimal(fee.discount_amount)
    current_total = sum((item["amount"] for item in fee_items), Decimal("0"))
    if discount > current_total or current_total - discount != _fee_decimal(fee.final_amount):
        raise HTTPException(status_code=409, detail="Fee breakdown does not match the ledger. Correct it before issuing a voucher.")

    organization = student.organization
    grade_name = classroom.grade.name
    class_section = f"{grade_name} - {classroom.section}" if classroom.section else grade_name

    school_data = {
        "school_name": getattr(organization, "name", None) or "School Name",
        "address": getattr(organization, "address", "") or "",
        "phone": getattr(organization, "phone", "") or "",
    }
    student_data = {
        "student_name": f"{student.first_name} {student.last_name or ''}".strip(),
        "father_name": getattr(student, "father_name", None) or "-",
        "student_id": str(getattr(student, "admission_no", None) or student.id),
        "class_section": class_section,
        "session": active_session.name,
    }
    voucher_data = {
        # Deterministic ID for the fee row; persist an issued voucher record
        # if you need revision history, voiding, or stable issue/due dates.
        "voucher_no": f"FV-{org_id}-{active_session.id}-{fee.id:06d}",
        "fee_month": fee.month,
        "issue_date": date.today().strftime("%d-%m-%Y"),
        "due_date": due_date.strftime("%d-%m-%Y"),
        "arrears": arrears,
        "discount": discount,
    }

    return dict(school=school_data, student=student_data, voucher=voucher_data,
                fee_items=fee_items, payment=None)


def _pdf_response(buffer, filename, extra_headers=None):
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "private, no-store",
            **(extra_headers or {}),
        },
    )


def _bulk_voucher_pdf(class_id, month, due_date, db, current_user, active_session):
    """Print the full class/month ledger, across all pages, before payment."""
    if month not in MONTH_TO_NUMBER:
        raise HTTPException(status_code=422, detail="Select a valid fee month")
    org_id = current_user.org_id
    try:
        period = resolve_legacy_month(month, active_session.start_date, active_session.end_date)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    classroom = _voucher_classroom(db, class_id, org_id, active_session.id)
    enrolled = db.query(StudentEnrollment.id).filter(
        StudentEnrollment.student_id == StudentFee.student_id,
        StudentEnrollment.classroom_id == class_id,
        StudentEnrollment.session_id == active_session.id,
        StudentEnrollment.is_active.is_(True),
    ).exists()
    fees = (
        db.query(StudentFee, FeeYearlyDiscount.id).join(Student, StudentFee.student_id == Student.id)
        .outerjoin(FeeYearlyDiscount, FeeYearlyDiscount.student_fee_id == StudentFee.id)
        .options(joinedload(StudentFee.student).joinedload(Student.organization))
        .filter(StudentFee.class_id == class_id, StudentFee.billing_period == period,
                StudentFee.organization_id == org_id, StudentFee.session_id == active_session.id,
                Student.organization_id == org_id, enrolled)
        .order_by(Student.first_name, Student.last_name, Student.admission_no, StudentFee.id)
        .all()
    )
    if not fees:
        raise HTTPException(status_code=404, detail="No fees found for this class and month. Generate fees first.")
    eligible = [fee for fee, discount_id in fees if _fee_decimal(fee.paid_amount) == 0 and discount_id is None]
    if not eligible:
        raise HTTPException(status_code=409, detail="No vouchers to generate: all matching fees already have recorded payments.")
    logo_image = organization_logo(eligible[0].student.organization)

    # Load balances once for the whole batch, including earlier classroom assignments.
    history = defaultdict(list)
    previous_fees = db.query(StudentFee, FeeYearlyDiscount.amount).outerjoin(
        FeeYearlyDiscount, FeeYearlyDiscount.student_fee_id == StudentFee.id,
    ).filter(
        StudentFee.organization_id == org_id, StudentFee.session_id == active_session.id,
        StudentFee.student_id.in_({fee.student_id for fee in eligible}),
    ).all()
    for previous_fee, yearly_discount in previous_fees:
        history[previous_fee.student_id].append((previous_fee, yearly_discount))
    vouchers = []
    for fee in eligible:
        try:
            payload = _voucher_payload(fee, classroom, active_session, org_id, due_date, history[fee.student_id])
            payload["school"]["logo_image"] = logo_image
            vouchers.append(payload)
        except HTTPException as exc:
            student = fee.student
            name = f"{student.first_name} {student.last_name or ''}".strip()
            raise HTTPException(status_code=exc.status_code,
                detail=f"Cannot generate vouchers: {name} ({student.admission_no}): {exc.detail}") from exc

    buffer = BytesIO()
    count = generate_fee_vouchers(buffer, vouchers)
    return _pdf_response(buffer, f"vouchers-class-{class_id}-{month}-{due_date.isoformat()}.pdf", {
        "X-Voucher-Count": str(count),
        "X-Voucher-Skipped": str(len(fees) - count),
        "Access-Control-Expose-Headers": "X-Voucher-Count, X-Voucher-Skipped",
    })


def _single_voucher_pdf(fee_id, due_date, db, current_user, active_session):
    """Render an A4 landscape two-copy fee voucher before payment."""
    org_id = current_user.org_id
    row = db.query(StudentFee, FeeYearlyDiscount.id).outerjoin(
        FeeYearlyDiscount, FeeYearlyDiscount.student_fee_id == StudentFee.id,
    ).filter(
        StudentFee.id == fee_id, StudentFee.organization_id == org_id,
        StudentFee.session_id == active_session.id,
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Fee record not found")
    fee, discount_id = row
    if discount_id is not None:
        raise HTTPException(status_code=409, detail="This fee has already been settled with a yearly discount.")
    classroom = _voucher_classroom(db, fee.class_id, org_id, active_session.id)
    previous_fees = db.query(StudentFee, FeeYearlyDiscount.amount).outerjoin(
        FeeYearlyDiscount, FeeYearlyDiscount.student_fee_id == StudentFee.id,
    ).filter(
        StudentFee.organization_id == org_id, StudentFee.student_id == fee.student_id,
        StudentFee.session_id == active_session.id, StudentFee.id != fee.id,
    ).all()
    payload = _voucher_payload(fee, classroom, active_session, org_id, due_date, previous_fees)
    payload["school"]["logo_image"] = organization_logo(fee.student.organization)
    buffer = BytesIO()
    generate_fee_voucher(buffer, **payload)
    return _pdf_response(buffer, f"voucher-{fee.id}.pdf")


@router.get("/fees/vouchers/bulk", response_class=StreamingResponse,
            responses={200: {"content": {"application/pdf": {}}}})
def print_bulk_fee_vouchers(
    class_id: int = Query(..., gt=0), month: str = Query(...), due_date: date = Query(...),
    db: Session = Depends(get_db), current_user=Depends(get_current_user),
    active_session=Depends(get_active_session),
):
    require_financial_permission(current_user, "view_fees")
    return _bulk_voucher_pdf(class_id, month, due_date, db, current_user, active_session)


@router.get("/fee/{fee_id}/voucher", include_in_schema=False)
@router.get("/fees/{fee_id}/voucher", response_class=StreamingResponse,
            responses={200: {"content": {"application/pdf": {}}}})
def print_fee_voucher(
    fee_id: int, due_date: date = Query(...),
    db: Session = Depends(get_db), current_user=Depends(get_current_user),
    active_session=Depends(get_active_session),
):
    require_financial_permission(current_user, "view_fees")
    return _single_voucher_pdf(fee_id, due_date, db, current_user, active_session)


