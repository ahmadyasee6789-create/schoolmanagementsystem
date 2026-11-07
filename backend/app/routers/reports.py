"""Existing Reports API: tenant/session-scoped, read-only reports."""
from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.dependencies import get_active_session
from app.routers.auth import get_current_user
from app.models.academic_session import AcademicSession
from app.models.attendance import Attendance
from app.models.classroom import Classroom, Grade
from app.models.exams import Exam, Term
from app.models.employee import Employee
from app.models.salary_payments import SalaryPayment
from app.models.student_fee import StudentFee
from app.models.fee_yearly_discount import FeeYearlyDiscount
from app.models.fee_allocation import FeeAllocation
from app.models.fee_transection import FeeTransaction
from app.services.fee_allocations import reconciled_fee_balance, remaining_credit
from app.models.students import Student
from app.schemas.reports import FeeReportItem, FeeReportResponse
from app.services.billing_periods import resolve_legacy_month
from app.services.reports import academic_access, enrollments, identity, exam_rows
from app.financial_permissions import require_financial_permission
from app.services.exam_result_sheets import saved_result_groups, scoped_exam, result_sheet
from app.services.exam_result_exports import export_sheet
from app.models.users import Organization
from sqlalchemy.orm import undefer

router = APIRouter(prefix="/reports", tags=["Reports"])


def report_session(session_id: Optional[int] = Query(None, gt=0), db: Session = Depends(get_db),
                   current_user=Depends(get_current_user)):
    query = db.query(AcademicSession).filter_by(organization_id=current_user.org_id)
    query = query.filter_by(id=session_id) if session_id is not None else query.filter_by(is_active=True)
    session = query.first()
    if session is None:
        raise HTTPException(404, "Academic session not found")
    return session


@router.get('/options')
def report_options(db: Session = Depends(get_db), current_user=Depends(get_current_user), active_session=Depends(report_session)):
    academic_access(current_user)
    exams = db.query(Exam.id, Exam.name).join(Term).filter(Exam.organization_id == current_user.org_id,
        Term.organization_id == current_user.org_id, Term.academic_year_id == active_session.id).order_by(Exam.id).all()
    return {'exams': [dict(id=e.id, name=e.name) for e in exams]}


@router.get("/exam-results")
def student_report(student_id: Optional[int] = None, exam_id: Optional[int] = None,
                   grade_name: Optional[str] = None, classroom_id: Optional[int] = None,
                   result: Optional[str] = Query(None, pattern="^(pass|fail|incomplete)$"),
                   db: Session = Depends(get_db), current_user=Depends(get_current_user),
                   active_session=Depends(report_session)):
    return exam_rows(db, current_user, active_session.id, exam_id, grade_name, classroom_id, student_id, result)


@router.get('/exam-summary')
def exam_summary(exam_id: int = Query(..., gt=0), grade_name: Optional[str] = None, classroom_id: Optional[int] = None,
                 result: Optional[str] = Query(None, pattern='^(pass|fail|incomplete)$'), db: Session = Depends(get_db),
                 current_user=Depends(get_current_user), active_session=Depends(report_session)):
    academic_access(current_user)
    exam = scoped_exam(db, current_user, exam_id, active_session.id)
    return result_sheet(saved_result_groups(db, current_user.org_id, active_session.id, exam_id=exam_id,
                        grade_name=grade_name, classroom_id=classroom_id, result=result), exam, active_session)


@router.get('/exam-summary/export')
def export_exam_summary(exam_id: int = Query(..., gt=0), format: Literal['xlsx', 'csv', 'pdf'] = 'xlsx',
                        grade_name: Optional[str] = None, classroom_id: Optional[int] = None,
                        result: Optional[str] = Query(None, pattern='^(pass|fail|incomplete)$'), db: Session = Depends(get_db),
                        current_user=Depends(get_current_user), active_session=Depends(report_session)):
    sheet = exam_summary(exam_id, grade_name, classroom_id, result, db, current_user, active_session)
    organization = db.query(Organization).options(undefer(Organization.logo)).filter_by(id=current_user.org_id).first() if format == 'pdf' else None
    return export_sheet(sheet, format, summary=True, organization=organization,
                        filters=f"Grade: {grade_name or 'All'} | Classroom: {classroom_id or 'All'} | Result: {result or 'All'}")


@router.get("/class/{classroom_id}")
def class_report(classroom_id: int, exam_id: Optional[int] = None, db: Session = Depends(get_db),
                 current_user=Depends(get_current_user), active_session=Depends(report_session)):
    academic_access(current_user)
    classroom = db.query(Classroom.id).filter_by(id=classroom_id, organization_id=current_user.org_id,
                                                academic_year_id=active_session.id).first()
    if not classroom:
        raise HTTPException(404, "Classroom not found")
    return dict(classroom_id=classroom_id, session=active_session.name,
                results=exam_rows(db, current_user, active_session.id, exam_id=exam_id, classroom_id=classroom_id))


@router.get("/students")
def students_report(grade_name: Optional[str] = None, gender: Optional[str] = None,
                    status: Optional[str] = Query(None, pattern="^(active|inactive)$"),
                    db: Session = Depends(get_db), current_user=Depends(get_current_user),
                    active_session=Depends(report_session)):
    academic_access(current_user)
    rows = []
    for e in enrollments(db, current_user.org_id, active_session.id, grade_name):
        s = e.student
        active = bool(s.is_active and e.is_active)
        if gender and s.gender != gender or status and active != (status == "active"):
            continue
        rows.append(dict(**identity(e), id=s.id, first_name=s.first_name, last_name=s.last_name or "",
                         gender=s.gender or "", date_of_birth=s.date_of_birth, phone=s.phone, father_name=s.father_name,
                         father_phone=s.father_phone, roll_number=e.roll_number, is_active=active))
    return rows


@router.get("/attendance")
def attendance_report(month: Optional[str] = None, grade_name: Optional[str] = None, classroom_id: Optional[int] = None,
                      start_date: Optional[date] = None, end_date: Optional[date] = None,
                      db: Session = Depends(get_db), current_user=Depends(get_current_user),
                      active_session=Depends(report_session)):
    academic_access(current_user)
    start, end = active_session.start_date, active_session.end_date
    if month:
        try:
            start = resolve_legacy_month(month, start, end)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        end = date(start.year + (start.month == 12), start.month % 12 + 1, 1)
        from datetime import timedelta
        end -= timedelta(days=1)
    start, end = max(start, start_date or start), min(end, end_date or end)
    if start > end:
        raise HTTPException(422, "Invalid date range")
    enrolled = enrollments(db, current_user.org_id, active_session.id, grade_name, classroom_id)
    records = db.query(Attendance).join(Student).join(Classroom, Attendance.class_id == Classroom.id).filter(
        Student.organization_id == current_user.org_id, Classroom.organization_id == current_user.org_id,
        Classroom.academic_year_id == active_session.id, Attendance.session_id == active_session.id,
        Attendance.date.between(start, end), Attendance.student_id.in_([e.student_id for e in enrolled]),
    ).all()
    grouped = defaultdict(dict)
    for record in records:
        grouped[(record.student_id, record.class_id)][record.date] = record.status
    rows = []
    for e in enrolled:
        statuses = list(grouped[(e.student_id, e.classroom_id)].values())
        counts = {s: statuses.count(s) for s in set(statuses)}
        # Only recorded days form the denominator. Missing days and holidays
        # are never invented. Late is recorded separately, not silently present.
        total = len(statuses)
        rows.append(dict(**identity(e), total_days=total, present=counts.get("present", 0), absent=counts.get("absent", 0),
                         leave=counts.get("leave", 0), late=counts.get("late", 0),
                         other=total-sum(counts.get(s, 0) for s in ("present", "absent", "leave", "late")),
                         attendance_pct=round(counts.get("present", 0)/total*100, 2) if total else None))
    return rows


@router.get("/payroll")
def get_payroll_report(month: Optional[str] = None, status: Optional[str] = Query(None, pattern="^(paid|unpaid|partial)$"),
                   role: Optional[str] = None, employee_id: Optional[int] = None,
                   db: Session = Depends(get_db), current_user=Depends(get_current_user),
                   active_session=Depends(report_session)):
    require_financial_permission(current_user, "view_fees")
    query = db.query(SalaryPayment, Employee).join(Employee).filter(
        SalaryPayment.organization_id == current_user.org_id, Employee.organization_id == current_user.org_id,
        SalaryPayment.session_id == active_session.id)
    if month:
        try:
            period = resolve_legacy_month(month, active_session.start_date, active_session.end_date)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        query = query.filter(SalaryPayment.month == period.month, SalaryPayment.year == period.year)
    if role:
        query = query.filter(Employee.role == role)
    if employee_id:
        query = query.filter(Employee.id == employee_id)
    rows = []
    for payment, employee in query.order_by(SalaryPayment.id).all():
        state = "paid" if payment.status == "paid" else "unpaid"
        if status and status != state:
            continue
        rows.append(dict(id=payment.id, member_name=employee.full_name, role=employee.role,
                         basic_salary=payment.gross_amount, allowances=payment.bonus or 0, deductions=payment.deductions or 0,
                         net_salary=payment.net_amount, month=f"{payment.year}-{payment.month:02d}", status=state,
                         paid_amount=payment.net_amount if state == "paid" else Decimal("0")))
    return rows


@router.get("/payroll/{teacher_id}")
def payroll_report(teacher_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user),
                          active_session=Depends(report_session)):
    require_financial_permission(current_user, "view_fees")
    # No teacher-to-employee foreign key exists. Reinterpreting a teacher ID as
    # an employee ID could silently return the wrong person's salary.
    raise HTTPException(410, "Teacher-based payroll reports are unavailable. Use /reports/payroll with an employee_id from the existing Employees module.")

@router.get("/fees", response_model=FeeReportResponse)
def get_fee_report(
    grade_name: Optional[str] = None,
    month: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    active_session=Depends(report_session),
):
    require_financial_permission(current_user, "view_fees")
    query = (
        db.query(StudentFee, Student, Grade, Classroom)
        .join(Student, StudentFee.student_id == Student.id)
        .join(Classroom, StudentFee.class_id == Classroom.id)
        .join(Grade, Classroom.grade_id == Grade.id)
        .filter(
            StudentFee.organization_id == current_user.org_id,
            StudentFee.session_id == active_session.id,
            Student.organization_id == current_user.org_id,
            Classroom.organization_id == current_user.org_id,
            Classroom.academic_year_id == active_session.id,
            Grade.organization_id == current_user.org_id,
        )
    ) 

    if grade_name: query = query.filter(Grade.name == grade_name)
    if month:
        try:
            period = resolve_legacy_month(month, active_session.start_date, active_session.end_date)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        query = query.filter(StudentFee.billing_period == period)

    # fetch all rows
    rows = query.order_by(StudentFee.id.desc()).all()
    allocations, adjustments = defaultdict(list), defaultdict(list)
    ids = [row[0].id for row in rows]
    for allocation in db.query(FeeAllocation).filter(FeeAllocation.student_fee_id.in_(ids)):
        allocations[allocation.student_fee_id].append(allocation)
    for adjustment in db.query(FeeYearlyDiscount).filter(FeeYearlyDiscount.student_fee_id.in_(ids)):
        adjustments[adjustment.student_fee_id].append(adjustment)

    items = []
    total_billed = total_paid = total_overdue = Decimal("0.00")
    current_period = date.today().replace(day=1)
    for fee, student, grade, classroom in rows:
        balance = reconciled_fee_balance(db, fee, allocations=allocations[fee.id], yearly_discounts=adjustments[fee.id])
        yearly_discount = sum((a.amount for a in adjustments[fee.id]), Decimal("0.00"))
        paid, final = fee.paid_amount, fee.final_amount - yearly_discount

        if paid >= final:       fee_status = 'paid'
        elif paid > 0:          fee_status = 'partial'
        else:                   fee_status = 'unpaid'

        # apply status filter in Python (avoids DB column mismatch)
        if status and fee_status != status:
            continue
        overdue = fee.billing_period < current_period and paid < final
        total_billed += final
        total_paid += paid
        if overdue:
            total_overdue += final - paid

        items.append(FeeReportItem(
            id               = fee.id,
            student_name     = f"{student.first_name} {student.last_name or ''}".strip(),
            admission_no     = student.admission_no,
            grade_name       = grade.name,
            section          = classroom.section,
            month            = fee.month,
            billing_period   = fee.billing_period.strftime("%Y-%m"),
            future           = fee.billing_period > current_period,
            overdue          = overdue,
            admission_fee    = float(fee.admission_fee),
            monthly_fee      = float(fee.monthly_fee),
            exam_fee         = float(fee.exam_fee),
            discount_percent = float(fee.discount_percent or 0),
            discount_amount  = float(fee.discount_amount + yearly_discount),
            total_amount     = float(fee.total_amount),
            final_amount     = final,
            paid_amount      = paid,
            due_amount       = balance,
            status           = fee_status,
        ))

    total_pending = total_billed - total_paid
    # Cash/credit describe the entire selected session, not billing-month
    # allocations. A yearly receipt is counted once, regardless of coverage.
    payments = db.query(FeeTransaction).filter_by(organization_id=current_user.org_id, session_id=active_session.id).all()
    by_payment = defaultdict(list)
    for allocation in db.query(FeeAllocation).filter(FeeAllocation.transaction_id.in_([p.id for p in payments])):
        by_payment[allocation.transaction_id].append(allocation)
    cash = sum((p.amount for p in payments), Decimal('0.00'))
    credit = sum((remaining_credit(db, p, allocations=by_payment[p.id]) for p in payments), Decimal('0.00'))

    return FeeReportResponse(
        items         = items,
        total         = len(items),
        total_billed  = total_billed,
        total_paid    = total_paid,
        total_pending = total_pending,
        total_overdue = total_overdue,
        session_cash_received = cash,
        session_advance_credit = credit,
    )
