from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, cast, Date
from datetime import datetime

from app.db.session import get_db
from app.models.users import User, OrganizationMember
from app.models.students import Student
from app.models.classroom import Classroom, Grade
from app.models.fee_transection import FeeTransaction
from app.models.expenses import Expense
from app.models.student_enrollment import StudentEnrollment
from app.routers.auth import get_current_user

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats")
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # ------------------------------------
    # Validate Organization Membership
    # ------------------------------------
    membership = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == current_user.id
    ).first()
    

    if not membership:
        raise HTTPException(status_code=403, detail="User does not belong to any school")

    org_id = membership.organization_id
    current_year = datetime.utcnow().year

    # ------------------------------------
    # SCHOOL OVERVIEW
    # ------------------------------------
    total_students = db.query(Student).filter(
        Student.organization_id == org_id
    ).count()

    active_students = db.query(Student).filter(
        Student.organization_id == org_id,
        Student.is_active.is_(True)
    ).count()

    total_teachers = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.role == "teacher"
    ).count()
    

    total_classes = db.query(Classroom).filter(
        Classroom.organization_id == org_id
    ).count()

    students_per_class = (
        db.query(
            Grade.name.label("grade_name"),
            func.count(StudentEnrollment.student_id).label("student_count")
        )
        .select_from(Classroom)
        .join(Grade, Classroom.grade_id == Grade.id)
        .outerjoin(StudentEnrollment, Classroom.id == StudentEnrollment.classroom_id)
        .filter(Classroom.organization_id == org_id)
        .group_by(Grade.id, Grade.name)
        .all()
    )
    # ------------------------------------
    # REVENUE (Current Year)
    # ------------------------------------
    revenue_query = (
        db.query(
            extract("month", FeeTransaction.payment_date).label("month"),
            func.coalesce(func.sum(FeeTransaction.amount), 0).label("revenue")
        )
        .filter(
            FeeTransaction.organization_id == org_id,
            extract("year", FeeTransaction.payment_date) == current_year
        )
        .group_by("month")
        .order_by("month")
        .all()
    )

    revenue_dict = {int(month): float(amount) for month, amount in revenue_query}

    # ------------------------------------
    # EXPENSES (Current Year)
    # ------------------------------------
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

    expense_dict = {int(month): float(amount) for month, amount in expense_query}

    # ------------------------------------
    # NORMALIZED 12-MONTH STRUCTURE
    # (Important for Charts)
    # ------------------------------------
    monthly_comparison = []
    total_year_revenue = 0
    total_year_expense = 0

    for month in range(1, 13):
        revenue = revenue_dict.get(month, 0)
        expense = expense_dict.get(month, 0)
        net = revenue - expense

        total_year_revenue += revenue
        total_year_expense += expense

        monthly_comparison.append({
            "month": month,
            "revenue": revenue,
            "expense": expense,
            "net": net
        })

    net_year_total = total_year_revenue - total_year_expense

    # ------------------------------------
    # RESPONSE (Professional Structure)
    # ------------------------------------
    return {
        "overview": {
            "students": {
                "total": total_students,
                "active": active_students,
                "inactive": total_students - active_students
            },
            "faculty": total_teachers,
            "classes": total_classes,
            "studentsPerClass": [
                {"class": name, "students": count}
                for name, count in students_per_class
            ],
        },

        "financials": {
            "year": current_year,

            "revenue": {
                "yearTotal": round(total_year_revenue, 2),
            },

            "expenses": {
                "yearTotal": round(total_year_expense, 2),
            },

            "net": {
                "yearTotal": round(net_year_total, 2),
            },

            "monthlyComparison": monthly_comparison
        }
    }