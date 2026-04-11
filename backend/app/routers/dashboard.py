from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, cast, Date
from datetime import date, datetime

from app.db.session import get_db
from app.models.users import User, OrganizationMember
from app.models.students import Student
from app.models.classroom import Classroom, Grade
from app.models.fee_transection import FeeTransaction
from app.models.expenses import Expense
from app.models.student_enrollment import StudentEnrollment
from app.models.salary_payments import SalaryPayment
from app.models.student_fee import StudentFee
from app.routers.auth import get_current_user
from app.dependencies import get_active_session
from app.routers.classes import validate_teacher_class
from app.models.attendance import Attendance

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats")
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    active_session=Depends(get_active_session)
):
    # ── Validate membership ───────────────────────────────────────────
    membership = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == current_user.id
    ).first()

    if not membership:
        raise HTTPException(status_code=403, detail="User does not belong to any school")

    org_id = membership.organization_id
    current_year = datetime.utcnow().year

    # ── School overview ───────────────────────────────────────────────


    total_teachers = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org_id,

        OrganizationMember.role == "teacher"
    ).count()
    if membership.role=="teacher":
        teacher_classes=db.query(Classroom).filter(
            Classroom.class_teacher_member_id==membership.id,
            Classroom.organization_id==org_id
        ).all()
        class_ids=[c.id for c in teacher_classes]
    else:
        class_ids=db.query(Classroom.id).filter(
            Classroom.organization_id==org_id
        ).all()
        class_ids=[c[0] for c in class_ids]
    active_students = db.query(StudentEnrollment).join(Student).filter(
    Student.organization_id == org_id,
    StudentEnrollment.session_id == active_session.id,
    StudentEnrollment.classroom_id.in_(class_ids),
    Student.is_active.is_(True)
).count()
    total_students=db.query(StudentEnrollment).join(Student).filter(
        StudentEnrollment.classroom_id.in_(class_ids),
         StudentEnrollment.session_id == active_session.id,
    Student.organization_id == org_id,
    ).count()
    today=date.today()
    attendance=db.query(Attendance).filter(
        Attendance.class_id.in_(class_ids),
        Attendance.session_id==active_session.id,
        Attendance.date==today
    )
    attendance_exists=attendance.first()
    present_count=attendance.filter(
        Attendance.status=="present"
    ).count()
    absent_count=attendance.filter(
        Attendance.status=="absent"
    ).count()
    percentage = 0
    if total_students > 0:
        percentage = round((present_count / total_students) * 100, 2)
  # For teacher
    if membership.role == "teacher":
        total_classes = db.query(Classroom).filter(
           Classroom.organization_id == org_id,
           Classroom.class_teacher_member_id == membership.id
    ).count()
    else:
      total_classes = db.query(Classroom).filter(
        Classroom.organization_id == org_id
    ).count()

    spc_query = (
    db.query(
        Grade.name.label("grade_name"),
        Classroom.section.label("class_name"),
        func.count(StudentEnrollment.id).label("student_count")
    )
    .join(Classroom, Classroom.grade_id == Grade.id)
    .join(StudentEnrollment, StudentEnrollment.classroom_id == Classroom.id)
    .filter(Classroom.organization_id == org_id)
)

    if membership.role == "teacher":
      spc_query = spc_query.filter(
        Classroom.class_teacher_member_id == membership.id
    )

    students_per_class = (
    spc_query
    .group_by(Grade.name, Grade.display_order, Classroom.section)
    .order_by(Grade.display_order, Classroom.section)
    .all()
)

    # ── Revenue — fee transactions (current year) ─────────────────────
    revenue_query = (
    db.query(
        extract("month", FeeTransaction.payment_date).label("month"),
        func.coalesce(func.sum(FeeTransaction.amount), 0).label("revenue")
    )
    .join(StudentFee, FeeTransaction.student_fee_id == StudentFee.id)
    .filter(
        FeeTransaction.organization_id == org_id,
        StudentFee.session_id == active_session.id,
        extract("year", FeeTransaction.payment_date) == current_year
    )
    .group_by(extract("month", FeeTransaction.payment_date))
    .order_by(extract("month", FeeTransaction.payment_date))

    .all()
)
    revenue_dict = {int(m): float(a) for m, a in revenue_query}

    # ── Operational expenses (current year) ───────────────────────────
    expense_query = (
        db.query(
            extract("month", cast(Expense.expense_date, Date)).label("month"),
            func.coalesce(func.sum(Expense.amount), 0).label("expense")
        )
        .filter(
            Expense.organization_id == org_id,
            extract("year", cast(Expense.expense_date, Date)) == current_year
        )
        .group_by("month")
        .order_by("month")
        .all()
    )
    expense_dict = {int(m): float(a) for m, a in expense_query}

    # ── Salary payments — paid only (current year) ────────────────────
    salary_query = (
        db.query(
            SalaryPayment.month.label("month"),
            func.coalesce(func.sum(SalaryPayment.net_amount), 0).label("salary")
        )
        .filter(
            SalaryPayment.organization_id == org_id,
            SalaryPayment.status == "paid",
            SalaryPayment.year == current_year
        )
        .group_by(SalaryPayment.month)
        .order_by(SalaryPayment.month)
        .all()
    )
    salary_dict = {int(m): float(a) for m, a in salary_query}

    # ── Total paid salaries this year ─────────────────────────────────
    total_year_salary = sum(salary_dict.values())

    # ── Pending salaries this year (generated but not yet paid) ───────
    pending_salary_total = db.query(
        func.coalesce(func.sum(SalaryPayment.net_amount), 0)
    ).filter(
        SalaryPayment.organization_id == org_id,
        SalaryPayment.status == "pending",
        SalaryPayment.year == current_year
    ).scalar() or 0

    # ── Normalized 12-month structure ─────────────────────────────────
    monthly_comparison = []
    total_year_revenue = 0
    total_year_expense = 0  # operational only
    total_year_total_expense = 0  # operational + salaries

    for month in range(1, 13):
        revenue = revenue_dict.get(month, 0)
        expense = expense_dict.get(month, 0)
        salary  = salary_dict.get(month, 0)
        total_exp = expense + salary
        net = revenue - total_exp

        total_year_revenue       += revenue
        total_year_expense       += expense
        total_year_total_expense += total_exp

        monthly_comparison.append({
            "month":   month,
            "revenue": revenue,
            "expense": expense,           # operational expenses only
            "salary":  salary,            # salary payouts
            "total_expense": total_exp,   # expense + salary combined
            "net":     net                # revenue - (expense + salary)
        })

    net_year_total = total_year_revenue - total_year_total_expense

    # ── Response ──────────────────────────────────────────────────────
    return {
        "overview": {
            "students": {
                "total":    total_students,
                "active":   active_students,
                "inactive": total_students - active_students,
            },
            "faculty":  total_teachers,
            "classes":  total_classes,
            "studentsPerClass": [
                # ✅ Combine them server-side before sending
{"class": f"{row.grade_name} {row.class_name}", "students": row.student_count}
for row in students_per_class
            ],
     },
        "attendance":{
               "total":total_students,
               "present":present_count,
            "absent":absent_count,
            "percentage":percentage,
               "marked":True if attendance_exists else False
         },

        "financials": {
            "year": current_year,

            "revenue": {
                "yearTotal": round(total_year_revenue, 2),
            },

            "expenses": {
                "yearTotal":          round(total_year_expense, 2),        # operational
                "salaryYearTotal":    round(total_year_salary, 2),         # paid salaries
                "pendingSalaryTotal": round(float(pending_salary_total), 2), # unpaid
                "combinedYearTotal":  round(total_year_total_expense, 2),  # both combined
            },

            "net": {
                "yearTotal": round(net_year_total, 2),  # revenue - (expenses + salaries)
            },

            "monthlyComparison": monthly_comparison,
        },
    }