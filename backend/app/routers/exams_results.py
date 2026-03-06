# app/routers/exam_results.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.routers.auth import get_current_user
from app.models.users import OrganizationMember
from app.models.students import Student
from app.models.student_enrollment import StudentEnrollment
from app.models.exams import Exam, ExamPaper
from app.models.exams import ExamResult
from app.models.exams import GradeScale
from app.schemas.exam_result import ExamResultCreate, ExamResultUpdate, ExamResultOut

router = APIRouter(prefix="/exam-results", tags=["Exam Results"])

# -------------------------
# Helper: calculate grade and gpa
# -------------------------
def calculate_grade_gpa(marks: int, total_marks: int, db: Session, org_id: int):
    percentage = (marks / total_marks) * 100 if total_marks > 0 else 0
    grade_scale = db.query(GradeScale).filter(
        GradeScale.organization_id == org_id,
        GradeScale.min_percentage <= percentage,
        GradeScale.max_percentage >= percentage
    ).order_by(GradeScale.min_percentage.desc()).first()
    if grade_scale:
        return grade_scale.grade, grade_scale.gpa
    return None, None

# -------------------------
# CREATE or UPDATE result (upsert)
# -------------------------
# CREATE or UPDATE result (upsert)
@router.post("/", response_model=ExamResultOut, status_code=status.HTTP_201_CREATED)
def create_exam_result(
    result_in: ExamResultCreate,
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user)
):
    # 1️⃣ Validate exam paper exists and belongs to org
    exam_paper = db.query(ExamPaper).join(Exam).filter(
        ExamPaper.id == result_in.exam_paper_id,
        Exam.organization_id == current_user.org_id
    ).first()
    if not exam_paper:
        raise HTTPException(status_code=404, detail="Exam paper not found")

    # 2️⃣ Validate student exists
    student = db.query(Student).filter(
        Student.id == result_in.student_enrollment_id,
        Student.organization_id == current_user.org_id
    ).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # 3️⃣ Get the student enrollment in that classroom
    enrollment = db.query(StudentEnrollment).filter(
        StudentEnrollment.id == result_in.student_enrollment_id,
        StudentEnrollment.classroom_id == exam_paper.classroom_id,
        StudentEnrollment.is_active == True
    ).first()
    if not enrollment:
        raise HTTPException(status_code=404, detail="Student is not enrolled in this classroom")

    # 4️⃣ Validate marks
    if result_in.obtained_marks > exam_paper.total_marks:
        raise HTTPException(
            status_code=400,
            detail=f"Marks obtained ({result_in.obtained_marks}) cannot exceed total marks ({exam_paper.total_marks})"
        )

    # 5️⃣ Upsert: check if result exists
    result = db.query(ExamResult).filter(
        ExamResult.exam_paper_id == exam_paper.id,
        ExamResult.student_enrollment_id == enrollment.id
    ).first()

    if result:
        result.obtained_marks = result_in.obtained_marks
    else:
        result = ExamResult(
            exam_paper_id=exam_paper.id,
            student_enrollment_id=enrollment.id,
            obtained_marks=result_in.obtained_marks
        )
        db.add(result)

    db.commit()
    db.refresh(result)

    # 6️⃣ Compute grade & GPA dynamically for response
    grade, gpa = calculate_grade_gpa(result.obtained_marks, exam_paper.total_marks, db, current_user.org_id)

    return {
        "id": result.id,
        "exam_paper_id": result.exam_paper_id,
        "student_enrollment_id": result.student_enrollment_id,
        "obtained_marks": result.obtained_marks,
        "grade": grade,
        "gpa": gpa
    }

# -------------------------
# GET results by exam — returns [] if none, never 404
# -------------------------
@router.get("/exam/{exam_id}", response_model=List[ExamResultOut])
def get_exam_results(exam_id: int, db: Session = Depends(get_db)):

    results = (
        db.query(ExamResult)
        .join(ExamPaper)
        .filter(ExamPaper.exam_id == exam_id)
        .all()
    )

    grade_scales = db.query(GradeScale).all()

    response = []

    for r in results:

        percentage = (r.obtained_marks / r.exam_paper.total_marks) * 100

        grade = None
        gpa = None

        for gs in grade_scales:
            if gs.min_percentage <= percentage <= gs.max_percentage:
                grade = gs.grade
                gpa = gs.gpa
                break

        response.append(
            ExamResultOut(
                id=r.id,
                exam_paper_id=r.exam_paper_id,
                student_enrollment_id=r.student_enrollment_id,
                obtained_marks=r.obtained_marks,
                grade=grade,
                gpa=gpa
            )
        )

    return response

# -------------------------
# GET results by student — returns [] if none, never 404
# -------------------------
@router.get("/student/{student_id}", response_model=List[ExamResultOut])
def get_student_results(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user)
):
    # 1️⃣ Validate student exists and belongs to org
    student = db.query(Student).filter(
        Student.id == student_id,
        Student.organization_id == current_user.org_id
    ).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # 2️⃣ Get all active enrollments for this student
    enrollments = db.query(StudentEnrollment).filter(
        StudentEnrollment.student_id == student.id,
        StudentEnrollment.is_active == True
    ).all()
    enrollment_ids = [e.id for e in enrollments]
    if not enrollment_ids:
        return []

    # 3️⃣ Fetch results for all enrollments
    results = db.query(ExamResult).join(ExamPaper).join(Exam).filter(
        ExamResult.student_enrollment_id.in_(enrollment_ids),
        Exam.organization_id == current_user.org_id
    ).all()

    # 4️⃣ Compute grade & GPA dynamically
    response = []
    for r in results:
        grade, gpa = calculate_grade_gpa(r.obtained_marks, r.exam_paper.total_marks, db, current_user.org_id)
        response.append({
    "id": r.id,
    "exam_paper_id": r.exam_paper_id,
    "student_enrollment_id": r.student_enrollment_id,  # use enrollment's student
    "obtained_marks": r.obtained_marks,            # match schema name
    "grade": grade,
    "gpa": gpa
})

    return response
# -------------------------
# GET single result by ID
# -------------------------
@router.get("/{result_id}", response_model=ExamResultOut)
def get_exam_result(
    result_id: int,
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user)
):
    result = db.query(ExamResult).join(ExamPaper).join(Exam).filter(
        ExamResult.id == result_id,
        Exam.organization_id == current_user.org_id
    ).first()
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")
    return result

# -------------------------
# DELETE result
# -------------------------
@router.delete("/{result_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exam_result(
    result_id: int,
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user)
):
    result = db.query(ExamResult).join(ExamPaper).join(Exam).filter(
        ExamResult.id == result_id,
        Exam.organization_id == current_user.org_id
    ).first()
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")

    db.delete(result)
    db.commit()
    return None
@router.get("/exam/{exam_id}/debug")
def debug_exam_results(exam_id: int, db: Session = Depends(get_db), current_user: OrganizationMember = Depends(get_current_user)):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    return {
        "exam_exists": bool(exam),
        "exam": {
            "id": exam.id if exam else None,
            "name": exam.name if exam else None,
            "organization_id": exam.organization_id if exam else None
        },
        "current_user_org": current_user.org_id
    }


