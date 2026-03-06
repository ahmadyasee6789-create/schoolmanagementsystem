# app/crud/student.py
from typing import Optional

from sqlalchemy.orm import Session, aliased
from sqlalchemy import or_
from fastapi import HTTPException

from app.models.students import Student
from app.models.student_enrollment import StudentEnrollment
from app.models.classroom import Classroom, Grade
from app.schemas.student import StudentCreate, StudentUpdate


# --------------------------------------------------
# CREATE STUDENT
# --------------------------------------------------
def create_student(db: Session, student: StudentCreate, org_id: int) -> Student:
    """Create a student record. Does NOT commit — caller owns the transaction."""
    exists = (
        db.query(Student)
        .filter(
            Student.organization_id == org_id,
            Student.admission_no == student.admission_no,
        )
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="Admission number already exists")

    db_student = Student(
        organization_id=org_id,
        admission_no=student.admission_no,
        first_name=student.first_name,
        last_name=student.last_name,
        gender=student.gender,
        date_of_birth=student.date_of_birth,
        phone=student.phone,
        email=student.email,
        father_name=student.father_name,
        father_phone=student.father_phone,
        mother_name=student.mother_name,
        guardian_name=student.guardian_name,
        guardian_phone=student.guardian_phone,
        is_active=True,
    )
    db.add(db_student)
    db.flush()  # assigns db_student.id; caller is responsible for commit
    db.refresh(db_student)
    return db_student


# --------------------------------------------------
# ENROLL STUDENT
# --------------------------------------------------
def enroll_student(
    db: Session,
    student_id: int,
    classroom_id: int,
    session_id: int,
    enrollment_date,
    roll_number: Optional[str] = None,
    discount_percent: float = 0.0,
) -> StudentEnrollment:
    """Create an enrollment record. Does NOT commit — caller owns the transaction."""
    enrollment = StudentEnrollment(
        student_id=student_id,
        classroom_id=classroom_id,
        session_id=session_id,
        enrollment_date=enrollment_date,
        is_active=True,
        roll_number=roll_number,
        discount_percent=discount_percent,
    )
    db.add(enrollment)
    db.flush()
    db.refresh(enrollment)
    return enrollment


# --------------------------------------------------
# GET STUDENTS (paginated, with enrollment info)
# --------------------------------------------------
def get_students(
    db: Session,
    org_id: int,
    page: int = 1,
    limit: int = 10,
    search: Optional[str] = None,
    grade_name: Optional[str] = None,
):
    """Return a page of students enriched with their current active enrollment."""
    # Build subquery for the latest active enrollment per student
    active_enrollment = (
        db.query(
            StudentEnrollment.student_id,
            StudentEnrollment.roll_number,
            StudentEnrollment.discount_percent,
            Classroom.section.label("section"),
            Grade.name.label("grade_name"),
        )
        .join(Classroom, StudentEnrollment.classroom_id == Classroom.id)
        .join(Grade, Classroom.grade_id == Grade.id)
        .filter(StudentEnrollment.is_active == True)
        .subquery()
    )

    query = (
        db.query(
            Student,
            active_enrollment.c.grade_name,
            active_enrollment.c.section,
            active_enrollment.c.roll_number,
            active_enrollment.c.discount_percent,
        )
        .outerjoin(active_enrollment, Student.id == active_enrollment.c.student_id)
        .filter(Student.organization_id == org_id)
    )

    if search:
        query = query.filter(
            or_(
                Student.first_name.ilike(f"%{search}%"),
                Student.last_name.ilike(f"%{search}%"),
                Student.admission_no.ilike(f"%{search}%"),
            )
        )

    if grade_name:
        query = query.filter(active_enrollment.c.grade_name == grade_name)

    rows = query.offset((page - 1) * limit).limit(limit).all()

    return [
        {
            "id": s.id,
            "organization_id": s.organization_id,
            "first_name": s.first_name,
            "last_name": s.last_name,
            "admission_no": s.admission_no,
            "gender": s.gender,
            "date_of_birth": s.date_of_birth,
            "phone": s.phone,
            "email": s.email,
            "father_name": s.father_name,
            "father_phone": s.father_phone,
            "mother_name": s.mother_name,
            "guardian_name": s.guardian_name,
            "guardian_phone": s.guardian_phone,
            "is_active": s.is_active,
            "grade_name": grade_name_val,
            "section": section,
            "roll_number": roll_number,
            "discount_percent": discount_percent,
        }
        for s, grade_name_val, section, roll_number, discount_percent in rows
    ]


# --------------------------------------------------
# GET BY ID
# --------------------------------------------------
def get_student_by_id(db: Session, student_id: int, org_id: int) -> Optional[Student]:
    return (
        db.query(Student)
        .filter(Student.id == student_id, Student.organization_id == org_id)
        .first()
    )


# --------------------------------------------------
# UPDATE STUDENT
# --------------------------------------------------
def update_student(
    db: Session, student_id: int, student: StudentUpdate, org_id: int
) -> Optional[Student]:
    db_student = get_student_by_id(db, student_id, org_id)
    if not db_student:
        return None

    for field, value in student.model_dump(exclude_unset=True).items():
        setattr(db_student, field, value)

    db.commit()
    db.refresh(db_student)
    return db_student


# --------------------------------------------------
# DELETE STUDENT
# --------------------------------------------------
def delete_student(db: Session, student_id: int, org_id: int) -> bool:
    student = get_student_by_id(db, student_id, org_id)
    if not student:
        return False

    db.query(StudentEnrollment).filter(
        StudentEnrollment.student_id == student_id
    ).delete()
    db.delete(student)
    db.commit()
    return True