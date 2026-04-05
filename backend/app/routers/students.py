# app/routers/students.py
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select
from datetime import date

from app.db.session import get_db
from app.schemas.student import (
    StudentCreate,
    StudentUpdate,
    StudentOut,
    StudentWithEnrollment,
    StudentWithEnrollmentCreate,
    StudentEnrollmentOut,
)
from app.crud import student as student_crud
from app.models.classroom import Classroom, Grade
from app.models.student_enrollment import StudentEnrollment
from app.models.students import Student
from app.models.academic_session import AcademicSession
from app.routers.auth import get_current_user
from app.dependencies import get_active_session

import logging

from app.models.users import OrganizationMember

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/students", tags=["Students"])

WRITE_ROLES = {"manager", "admin", "teacher"}
DELETE_ROLES = {"manager", "admin"}


def require_write_access(current_user):
    if current_user.org_role not in WRITE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only managers, admins, or teachers can perform this action",
        )


def require_delete_access(current_user):
    if current_user.org_role not in DELETE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only managers or admins can delete students",
        )


# -------------------------------------------------------------------
# CREATE STUDENT
# -------------------------------------------------------------------
@router.post("/", response_model=StudentOut, status_code=status.HTTP_201_CREATED)
def create_student(
    data: StudentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Create a new student without enrollment."""
    require_write_access(current_user)
    try:
        student = student_crud.create_student(db=db, student=data, org_id=current_user.org_id)
        db.commit()
        db.refresh(student)
        return student
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# -------------------------------------------------------------------
# CREATE STUDENT WITH ENROLLMENT
# -------------------------------------------------------------------
@router.post(
    "/with-enrollment",
    response_model=StudentOut,
    status_code=status.HTTP_201_CREATED,
)
def create_student_with_enrollment(
    data: StudentWithEnrollmentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    
    """Create a new student and enroll them in a class within a single transaction."""
    require_write_access(current_user)

    try:
        # Validate academic session
        session = db.execute(
            select(AcademicSession).where(
                AcademicSession.id == data.session_id,
                AcademicSession.organization_id == current_user.org_id,
                AcademicSession.is_active == True,
            )
        ).scalar_one_or_none()

        if not session:
            raise HTTPException(status_code=400, detail="Invalid academic session")

        # Validate classroom
        classroom = db.execute(
            select(Classroom).where(
                Classroom.id == data.classroom_id,
                Classroom.organization_id == current_user.org_id,
            )
        ).scalar_one_or_none()

        if not classroom:
            raise HTTPException(status_code=400, detail="Invalid classroom")

        # Create student and enrollment
        student = student_crud.create_student(db=db, student=data, org_id=current_user.org_id)
        student_crud.enroll_student(
            db=db,
            student_id=student.id,
            classroom_id=data.classroom_id,
            session_id=data.session_id,
            enrollment_date=data.enrollment_date,
            
            discount_percent=data.discount_percent,
        )

        db.commit()
        db.refresh(student)
        return student

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Admission number already exists or invalid foreign key",
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create student with enrollment: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


# -------------------------------------------------------------------
# LIST STUDENTS
# -------------------------------------------------------------------
from pydantic import BaseModel

class PaginatedStudents(BaseModel):
    items: List[StudentWithEnrollment]
    total: int
    page: int
    total_pages: int


@router.get("/", response_model=PaginatedStudents)
def list_students(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: Optional[str] = None,
    grade_name: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    active_session=Depends(get_active_session),
    
):
    member = db.query(OrganizationMember).filter(
    OrganizationMember.user_id == current_user.id,
    OrganizationMember.organization_id == current_user.org_id
).first()
    try:
        students, total = student_crud.get_students(
            db=db,
            org_id=current_user.org_id,
            active_session=active_session,
            member=member,
            page=page,
            limit=limit,
            search=search,
            grade_name=grade_name,
        )
        return {
            "items": students,
            "total": total,
            "page": page,
            "total_pages": max(1, -(-total // limit)),  # ceiling division
        }
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# -------------------------------------------------------------------
# GET SINGLE STUDENT
# -------------------------------------------------------------------
@router.get("/{student_id}", response_model=StudentOut)
def get_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get a student by ID."""
    student = student_crud.get_student_by_id(
        db=db, student_id=student_id, org_id=current_user.org_id
    )
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    return student


# -------------------------------------------------------------------
# UPDATE STUDENT
# -------------------------------------------------------------------
@router.put("/{student_id}", response_model=StudentOut)
def update_student(
    student_id: int,
    data: StudentUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Update student information."""
    require_write_access(current_user)
    student = student_crud.update_student(
        db=db, student_id=student_id, student=data, org_id=current_user.org_id
    )
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    return student


# -------------------------------------------------------------------
# DELETE STUDENT
# -------------------------------------------------------------------
@router.delete("/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Delete a student and their enrollments."""
    require_delete_access(current_user)
    deleted = student_crud.delete_student(
        db=db, student_id=student_id, org_id=current_user.org_id
    )
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")


# -------------------------------------------------------------------
# ENROLL EXISTING STUDENT
# -------------------------------------------------------------------
@router.post("/{student_id}/enroll", response_model=StudentEnrollmentOut)
def enroll_student(
    student_id: int,
    classroom_id: int = Query(...),
    session_id: int = Query(...),
    enrollment_date: date = Query(...),
    roll_number: Optional[str] = None,
    discount_percent: float = 0.0,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Enroll an existing student in a class."""
    require_write_access(current_user)

    student = student_crud.get_student_by_id(
        db=db, student_id=student_id, org_id=current_user.org_id
    )
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    classroom = db.query(Classroom).filter(
        Classroom.id == classroom_id,
        Classroom.organization_id == current_user.org_id,
    ).first()
    if not classroom:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found")

    return student_crud.enroll_student(
        db=db,
        student_id=student_id,
        classroom_id=classroom_id,
        session_id=session_id,
        enrollment_date=enrollment_date,
        roll_number=roll_number,
        discount_percent=discount_percent,
    )


# -------------------------------------------------------------------
# GET STUDENTS BY CLASS
# -------------------------------------------------------------------
@router.get("/by-class/{classroom_id}", response_model=List[StudentWithEnrollment])
def get_students_by_classroom_id(
    classroom_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    active_session=Depends(get_active_session)
):

    classroom = (
        db.query(Classroom)
        .filter(
            Classroom.id == classroom_id,
            Classroom.organization_id == current_user.org_id
        )
        .first()
    )

    if not classroom:
        raise HTTPException(status_code=404, detail="Class not found")

    rows = (
        db.query(
            Student,
             StudentEnrollment.id.label("enrollment_id"),
            Grade.name.label("grade_name"),
            Classroom.section.label("section"),
            StudentEnrollment.roll_number.label("roll_number"),
            StudentEnrollment.discount_percent.label("discount_percent"),
        )
        .join(StudentEnrollment, Student.id == StudentEnrollment.student_id)
        .join(Classroom, StudentEnrollment.classroom_id == Classroom.id)
        .join(Grade, Classroom.grade_id == Grade.id)
        .filter(
            Student.organization_id == current_user.org_id,
            StudentEnrollment.classroom_id == classroom_id,
            StudentEnrollment.session_id == active_session.id,
            StudentEnrollment.is_active == True,
        )
        .order_by(StudentEnrollment.roll_number)
        .all()
    )

    students = []
    for row in rows:
        student_data = row.Student.__dict__.copy()
        student_data.pop("_sa_instance_state", None)

        students.append(
            StudentWithEnrollment(
                **student_data,
                enrollment_id=row.enrollment_id,
                grade_name=row.grade_name,
                section=row.section,
                roll_number=row.roll_number,
                discount_percent=row.discount_percent,
            )
        )

    return students
# -------------------------------------------------------------------
# GET STUDENT ENROLLMENT HISTORY
# -------------------------------------------------------------------
@router.get("/{student_id}/enrollments", response_model=List[StudentEnrollmentOut])
def get_student_enrollments(
    student_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    active_session=Depends(get_active_session)
):
    """Get all enrollments for a student."""
    student = student_crud.get_student_by_id(
        db=db, student_id=student_id, org_id=current_user.org_id
    )
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    return db.query(StudentEnrollment).filter(
        StudentEnrollment.student_id == student_id,
        StudentEnrollment.session_id==active_session.id
    ).all()
