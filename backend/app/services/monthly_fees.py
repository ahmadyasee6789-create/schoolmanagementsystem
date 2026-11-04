"""Shared monthly charge creation; callers own organization locking and commit."""
from decimal import Decimal, ROUND_HALF_UP
from datetime import date

from fastapi import HTTPException

from app.models.academic_session import AcademicSession
from app.models.classroom import Classroom, Grade
from app.models.fee_structure import FeeStructure
from app.models.student_enrollment import StudentEnrollment
from app.models.student_fee import StudentFee
from app.models.students import Student
from app.services.billing_periods import NUMBER_TO_MONTH, validate_period
from app.services.fee_amounts import CENT, money
from app.services.fee_locks import lock_financial_organization


def calculate_monthly_charge(structure, discount_percent, *, admission_due, include_exam_fee=False):
    """Snapshot the current policy, including validating excluded components."""
    admission_rate = money(structure.admission_fee)
    monthly = money(structure.monthly_fee)
    exam_rate = money(structure.exam_fee)
    percent = money(discount_percent if discount_percent is not None else 0)
    if percent > 100:
        raise HTTPException(409, "Invalid enrollment discount; correct it before generating fees")
    admission = admission_rate if admission_due else Decimal("0.00")
    exam = exam_rate if include_exam_fee else Decimal("0.00")
    total = money(admission + monthly + exam)
    discount = (monthly * percent / 100).quantize(CENT, rounding=ROUND_HALF_UP)
    final = total - discount
    return dict(admission_fee=admission, monthly_fee=monthly, exam_fee=exam,
                total_amount=total, discount_percent=percent, discount_amount=discount,
                final_amount=final, paid_amount=Decimal("0.00"),
                status="paid" if final == 0 else "unpaid")


def get_or_create_monthly_fee(db, *, org_id, student_id, session_id, period, include_exam_fee=False,
                            include_admission_fee=True):
    """Requires the organization lock. Never commits or reprices issued charges.

    Explicit flushes are intentional: production sessions use autoflush=False,
    and subsequent months must see an admission charge created in this unit of work.
    """
    lock_financial_organization(db, org_id)
    session = db.query(AcademicSession).filter_by(id=session_id, organization_id=org_id).first()
    student = db.query(Student).filter_by(id=student_id, organization_id=org_id).first()
    if session is None or student is None:
        raise HTTPException(404, "Student or academic session not found")
    try:
        validate_period(period, session.start_date, session.end_date)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    existing = db.query(StudentFee).filter_by(
        organization_id=org_id, student_id=student_id, session_id=session_id, billing_period=period,
    ).first()
    if existing is not None:
        return existing, False
    values = quote_missing_month(db, org_id=org_id, student_id=student_id, session_id=session_id,
                                period=period, include_exam_fee=include_exam_fee,
                                include_admission_fee=include_admission_fee, lock=True)
    fee = StudentFee(**values)
    db.add(fee)
    db.flush()
    return fee, True


def quote_missing_month(db, *, org_id, student_id, session_id, period, include_exam_fee=False,
                       include_admission_fee=False, admission_planned=False, lock=False):
    """Pure read/calculation shared by preview and generation. Never flushes."""
    def read(query):
        query = query.populate_existing()
        return (query.with_for_update() if lock else query).first()

    student = read(db.query(Student).filter_by(id=student_id, organization_id=org_id))
    session = read(db.query(AcademicSession).filter_by(id=session_id, organization_id=org_id))
    if student is None or session is None:
        raise HTTPException(404, "Student or academic session not found")
    enrollment = read(db.query(StudentEnrollment).filter_by(
        student_id=student_id, session_id=session_id, is_active=True,
    ))
    if enrollment is None or not student.is_active or enrollment.enrollment_date is None:
        raise HTTPException(409, "An active student enrollment with dates is required")
    try:
        validate_period(period, session.start_date, session.end_date,
                        enrollment.enrollment_date, enrollment.withdrawal_date)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    classroom = read(db.query(Classroom).join(Grade).filter(
        Classroom.id == enrollment.classroom_id, Classroom.organization_id == org_id,
        Grade.organization_id == org_id, Classroom.academic_year_id == session_id,
    ))
    if classroom is None:
        raise HTTPException(409, "Enrollment classroom does not belong to this organization and session")
    structure = read(db.query(FeeStructure).filter_by(
        class_id=classroom.id, organization_id=org_id, session_id=session_id,
    ))
    if structure is None:
        raise HTTPException(404, "Fee structure not found for this class and session")
    if period > date.today().replace(day=1) and not structure.rates_finalized:
        raise HTTPException(409, "Future rates are not confirmed; confirm the fee structure or collect advance-only credit")
    has_admission = db.query(StudentFee.id).filter(
        StudentFee.organization_id == org_id, StudentFee.student_id == student_id,
        StudentFee.session_id == session_id, StudentFee.admission_fee > 0,
    ).first() is not None
    return dict(
        organization_id=org_id, student_id=student_id, session_id=session_id, class_id=classroom.id,
        billing_period=period, month=NUMBER_TO_MONTH[period.month],
        **calculate_monthly_charge(structure, enrollment.discount_percent,
                                   admission_due=include_admission_fee and not has_admission and not admission_planned,
                                   include_exam_fee=include_exam_fee),
    )
