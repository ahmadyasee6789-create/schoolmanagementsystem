# app/routers/reports.py
import math

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date

from app.db.session import get_db
from app.routers.auth import get_current_user
from app.models.users import OrganizationMember
from app.models.students import Student
from app.models.student_enrollment import StudentEnrollment
from app.models.exams import ExamResult, ExamPaper, Exam, Term
from app.dependencies import get_active_session
from app.models.student_fee import StudentFee
from app.models.fee_transection import FeeTransaction
from app.schemas.reports import FeeReportItem,FeeReportResponse
from app.models.classroom import Classroom,Grade


router = APIRouter(prefix="/reports", tags=["Reports"])


# -------------------------
# Student Exam Report
# -------------------------
@router.get("/student/{student_id}")
def student_report(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user),
    active_session=Depends(get_active_session)
):
    """
    Return all exam results of a student for the active session.
    """
    # Validate student
    student = db.query(Student).filter(
        Student.id == student_id,
        Student.organization_id == current_user.org_id
    ).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Get active enrollment(s) for current session
    enrollments = db.query(StudentEnrollment).filter(
        StudentEnrollment.student_id == student.id,
        StudentEnrollment.is_active == True,
        StudentEnrollment.session_id == active_session.id
    ).all()
    enrollment_ids = [e.id for e in enrollments]
    if not enrollment_ids:
        return {"student": student.full_name, "results": []}

    # Get exam results
    results = db.query(ExamResult).join(ExamPaper).join(Exam).join(Term).filter(
        ExamResult.student_enrollment_id.in_(enrollment_ids),
        Exam.organization_id == current_user.org_id,
        Term.academic_year_id == active_session.id
    ).all()

    report = []
    for r in results:
        report.append({
            "exam_name": r.exam_paper.exam.name,
            "subject": r.exam_paper.subject.name,
            "marks_obtained": r.obtained_marks,
            "total_marks": r.exam_paper.total_marks,
            "date": r.exam_paper.date
        })

    return {
        "student": student.full_name,
        "classroom": enrollments[0].classroom.name if enrollments else None,
        "session": active_session.name,
        "results": report
    }


# -------------------------
# Class Exam Report
# -------------------------
@router.get("/class/{classroom_id}")
def class_report(
    classroom_id: int,
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user),
    active_session=Depends(get_active_session)
):
    """
    Return exam results for all students in a classroom for the active session.
    """
    # Get all active students in this classroom & session
    enrollments = db.query(StudentEnrollment).filter(
        StudentEnrollment.classroom_id == classroom_id,
        StudentEnrollment.is_active == True,
        StudentEnrollment.session_id == active_session.id
    ).all()
    enrollment_ids = [e.id for e in enrollments]
    if not enrollment_ids:
        return {"classroom_id": classroom_id, "results": []}

    results = db.query(ExamResult).join(ExamPaper).join(Exam).join(Term).filter(
        ExamResult.student_enrollment_id.in_(enrollment_ids),
        Exam.organization_id == current_user.org_id,
        Term.academic_year_id == active_session.id
    ).all()

    report = []
    for r in results:
        report.append({
            "student_name": r.student_enrollment.student.full_name,
            "exam_name": r.exam_paper.exam.name,
            "subject": r.exam_paper.subject.name,
            "marks_obtained": r.obtained_marks,
            "total_marks": r.exam_paper.total_marks,
            "date": r.exam_paper.date
        })

    return {
        "classroom_id": classroom_id,
        "session": active_session.name,
        "results": report
    }
@router.get("/payroll/{teacher_id}")
def payroll_report(
    teacher_id: int,
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user),
    active_session=Depends(get_active_session)
):

    salaries = db.query(TeacherSalary).filter(
        TeacherSalary.teacher_id == teacher_id,
        TeacherSalary.organization_id == current_user.org_id,
        TeacherSalary.session_id == active_session.id
    ).all()

    report = []
    for s in salaries:
        report.append({
            "month": s.month,
            "amount": s.amount,
            "status": "Paid" if s.is_paid else "Pending",
            "payment_date": s.payment_date
        })

    return {
        "teacher_id": teacher_id,
        "session": active_session.name,
        "salaries": report
    }
@router.get("/fees", response_model=FeeReportResponse)
def get_fee_report(
    grade_name: Optional[str] = None,
    month: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    active_session=Depends(get_active_session),
):
    query = (
        db.query(StudentFee, Student, Grade, Classroom)
        .join(Student, StudentFee.student_id == Student.id)
        .join(StudentEnrollment,
              (StudentEnrollment.student_id == Student.id) &
              (StudentEnrollment.session_id == active_session.id) &
              (StudentEnrollment.is_active == True))
        .join(Classroom, StudentEnrollment.classroom_id == Classroom.id)
        .join(Grade, Classroom.grade_id == Grade.id)
        .filter(
            StudentFee.organization_id == current_user.org_id,
            StudentFee.session_id == active_session.id,
        )
    ) 

    if grade_name: query = query.filter(Grade.name == grade_name)
    if month:      query = query.filter(StudentFee.month == month)

    # fetch all rows
    rows = query.order_by(StudentFee.id.desc()).all()

    items = []
    for fee, student, grade, classroom in rows:
        paid  = float(fee.paid_amount)
        final = float(fee.final_amount)

        if paid >= final:       fee_status = 'paid'
        elif paid > 0:          fee_status = 'partial'
        else:                   fee_status = 'unpaid'

        # apply status filter in Python (avoids DB column mismatch)
        if status and fee_status != status:
            continue

        items.append(FeeReportItem(
            id               = fee.id,
            student_name     = f"{student.first_name} {student.last_name}",
            admission_no     = student.admission_no,
            grade_name       = grade.name,
            section          = classroom.section,
            month            = fee.month,
            admission_fee    = float(fee.admission_fee),
            monthly_fee      = float(fee.monthly_fee),
            exam_fee         = float(fee.exam_fee),
            discount_percent = float(fee.discount_percent or 0),
            discount_amount  = float(fee.discount_amount),
            total_amount     = float(fee.total_amount),
            final_amount     = final,
            paid_amount      = paid,
            due_amount       = round(final - paid, 2),
            status           = fee_status,
        ))

    total_billed  = sum(i.final_amount for i in items)
    total_paid    = sum(i.paid_amount   for i in items)
    total_pending = round(total_billed - total_paid, 2)

    return FeeReportResponse(
        items         = items,
        total         = len(items),
        total_billed  = total_billed,
        total_paid    = total_paid,
        total_pending = total_pending,
    )