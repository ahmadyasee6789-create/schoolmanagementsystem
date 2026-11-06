# app/routers/students.py
from fastapi import UploadFile, File
from app.services.student_import_service import confirm_student_import, preview_student_import, validate_student_import
from app.schemas.student_import import StudentImportValidation, StudentImportConfirmation
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select
from datetime import date
from decimal import Decimal

from app.db.session import get_db
from app.schemas.student import (
    StudentCreate,
    StudentUpdate,
    StudentOut,
    StudentWithEnrollment,
    StudentWithEnrollmentCreate,
    StudentEnrollmentOut,
    StudentDetailOut,
)
from app.crud import student as student_crud
from app.models.classroom import Classroom, Grade
from app.models.student_enrollment import StudentEnrollment
from app.models.students import Student
from app.models.academic_session import AcademicSession
from app.routers.auth import get_current_user
from app.dependencies import get_active_session
from app.financial_permissions import require_discount_access

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
@router.post("", response_model=StudentOut, status_code=status.HTTP_201_CREATED)
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
    require_discount_access(current_user, data.discount_percent)

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
                Classroom.academic_year_id == data.session_id,
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


@router.get("", response_model=PaginatedStudents)
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

@router.post("/import/preview")
def import_students_preview(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    active_session=Depends(get_active_session),
):
    require_write_access(current_user)

    return preview_student_import(
        file=file,
        db=db,
        org_id=current_user.org_id,
        session_id=active_session.id,
        user_id=current_user.id,
    )
@router.post("/import/validate")
def import_students_validate(
    request: StudentImportValidation,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    active_session=Depends(get_active_session),
):
    require_write_access(current_user)
    return validate_student_import(request, db, current_user.org_id, active_session.id, current_user.id)


@router.post("/import/confirm")
def import_students_confirm(
    request: StudentImportConfirmation,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    active_session=Depends(get_active_session),
):
    require_write_access(current_user)
    return confirm_student_import(
        request=request,
        db=db,
        org_id=current_user.org_id,
        session_id=active_session.id,
        user_id=current_user.id,
    )
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
@router.get(
    "/{student_id}/details",
    response_model=StudentDetailOut
)
def get_student_details_endpoint(
    student_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Profiles remain available even before an academic session is activated.
    active_session = db.query(AcademicSession).filter(
        AcademicSession.organization_id == current_user.org_id,
        AcademicSession.is_active == True,
    ).first()
    result = student_crud.get_student_details(
        db=db,
        student_id=student_id,
        org_id=current_user.org_id,
        session_id=active_session.id if active_session else None,
    )

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Student not found"
        )

    student, enrollment = result

    response = StudentOut.model_validate(student).model_dump()

    enrollment_data = None

    if enrollment:
        enrollment_data = {
            "id": enrollment.id,
            "session_id": enrollment.session_id,
            "session_name": enrollment.session.name,
            "classroom_id": enrollment.classroom_id,
            "class_name": (
                f"{enrollment.classroom.grade.name} – {enrollment.classroom.section}"
                if enrollment.classroom
                else None
            ),
            "grade_name": enrollment.classroom.grade.name if enrollment.classroom else None,
            "section": enrollment.classroom.section if enrollment.classroom else None,
            "roll_number": enrollment.roll_number,
            "discount_percent": enrollment.discount_percent or 0,
            "enrollment_date": enrollment.enrollment_date,
            "withdrawal_date": enrollment.withdrawal_date,
            "is_active": enrollment.is_active,
        }

    return {
        **response,
        "active_session": active_session,
        "current_enrollment": enrollment_data,
    }


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
    """Update profile and an explicitly confirmed enrollment discount atomically."""
    require_write_access(current_user)
    if data.enrollment_discount is not None and current_user.org_role != "admin":
        raise HTTPException(status_code=403, detail="Only school administrators can change enrollment discounts")
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
    """Delete an unbilled student; students with financial history must be archived."""
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
    discount_percent: Decimal = Query(default=Decimal("0"), ge=0, le=100, max_digits=5, decimal_places=2, allow_inf_nan=False),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Enroll an existing student in a class."""
    require_write_access(current_user)
    require_discount_access(current_user, discount_percent)

    student = student_crud.get_student_by_id(
        db=db, student_id=student_id, org_id=current_user.org_id
    )
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    classroom = db.query(Classroom).filter(
        Classroom.id == classroom_id,
        Classroom.organization_id == current_user.org_id,
        Classroom.academic_year_id == session_id,
    ).first()
    if not classroom:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found")

    session = db.query(AcademicSession).filter(
        AcademicSession.id == session_id,
        AcademicSession.organization_id == current_user.org_id,
    ).first()
    if not session:
        raise HTTPException(status_code=400, detail="Invalid academic session")

    try:
        enrollment = student_crud.enroll_student(
            db=db,
            student_id=student_id,
            classroom_id=classroom_id,
            session_id=session_id,
            enrollment_date=enrollment_date,
            roll_number=roll_number,
            discount_percent=discount_percent,
        )
        db.commit()
        db.refresh(enrollment)
        return enrollment
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Student is already enrolled or enrollment conflicts with an existing record") from exc


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
