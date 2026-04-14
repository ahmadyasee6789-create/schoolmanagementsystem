# app/routers/attendance.py
from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.routers.auth import get_current_user
from app.models.classroom import Classroom
from app.models.attendance import Attendance
from app.models.students import Student
from app.models.student_enrollment import StudentEnrollment
from app.schemas.attendence import AttendanceCreate
from app.models.users import OrganizationMember
from app.dependencies import get_active_session
router = APIRouter(prefix="/attendance", tags=["Attendance"])


# -------------------------------------------------------------------
# HELPERS
# -------------------------------------------------------------------
def validate_teacher_class(user_id: int, class_id: int, db: Session):
    """Raise 403 if the teacher (by user_id) is not assigned to the given class."""
    assigned = (
        db.query(Classroom)
        .join(OrganizationMember, Classroom.class_teacher_member_id == OrganizationMember.id)
        .filter(
            Classroom.id == class_id,
            OrganizationMember.user_id == user_id,
        )
        .first()
    )
    if not assigned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not assigned to this class")


def get_enrolled_students(class_id: int, db: Session) -> List[Student]:
    """Return all actively enrolled students for a class."""
    return (
        db.query(Student)
        .join(StudentEnrollment, Student.id == StudentEnrollment.student_id)
        .filter(
            StudentEnrollment.classroom_id == class_id,
            StudentEnrollment.is_active == True,
        )
        .all()
    )


# -------------------------------------------------------------------
# MARK / UPDATE ATTENDANCE
# -------------------------------------------------------------------
@router.post("", status_code=status.HTTP_200_OK)
def mark_attendance(
    data: List[AttendanceCreate],
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    active_session=Depends(get_active_session)
):
    if not data:
        raise HTTPException(status_code=400, detail="No attendance data provided")

    class_id = data[0].class_id
    attendance_date = data[0].date if hasattr(data[0], "date") else date.today()

    if current_user.org_role == "teacher":
        validate_teacher_class(current_user.id, class_id, db)

    for record in data:
        existing = db.query(Attendance).filter(
            Attendance.student_id == record.student_id,
            Attendance.class_id == class_id,
            Attendance.date == attendance_date,
            Attendance.session_id==active_session.id
        ).first()

        if existing:
            existing.status = record.status
        else:
            db.add(Attendance(
                student_id=record.student_id,
                session_id=active_session.id,
                class_id=class_id,
                date=attendance_date,
                status=record.status,
            ))

    db.commit()
    return {"message": "Attendance saved successfully"}


# -------------------------------------------------------------------
# GET ATTENDANCE (or student list if none recorded yet)
# -------------------------------------------------------------------
@router.get("", status_code=status.HTTP_200_OK)
def get_attendance(
    class_id: int,
    attendance_date: date,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    active_session=Depends(get_active_session)
):
    if current_user.org_role == "teacher" :
        validate_teacher_class(current_user.id, class_id, db)

    records = (
        db.query(Attendance, Student)
        .join(Student, Attendance.student_id == Student.id)
        .filter(
            Attendance.class_id == class_id,
            Attendance.date == attendance_date,
            Attendance.session_id==active_session.id
        )
        .all()
    )

    if records:
        return [
            {
                "student_id": student.id,
                "name": f"{student.first_name} {student.last_name}",
                "date": attendance.date,
                "status": attendance.status,
            }
            for attendance, student in records
        ]

    # No attendance recorded yet — return enrolled students with default status
    students = get_enrolled_students(class_id, db)
    return [
        {
            "student_id": s.id,
            "name": f"{s.first_name} {s.last_name}",
            "date": attendance_date,
            "status": "present",
        }
        for s in students
    ]