# app/routers/exam_results.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel

from app.db.session import get_db
from app.routers.auth import get_current_user
from app.models.users import OrganizationMember
from app.models.students import Student
from app.models.student_enrollment import StudentEnrollment
from app.models.exams import Exam, ExamPaper, ExamResult, Term, GradeScale
from app.schemas.exam_result import ExamResultCreate, ExamResultUpdate, ExamResultOut
from app.dependencies import get_active_session

router = APIRouter(prefix="/exam-results", tags=["Exam Results"])


# ─────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────
class BulkExamResultOut(BaseModel):
    succeeded: List[ExamResultOut]
    failed: List[dict]


# ─────────────────────────────────────────────
# Helper
# ─────────────────────────────────────────────
def calculate_grade_gpa(marks: int, total_marks: int, db: Session, org_id: int):
    percentage = (marks / total_marks) * 100 if total_marks > 0 else 0
    grade_scale = (
        db.query(GradeScale)
        .filter(
            GradeScale.organization_id == org_id,
            GradeScale.min_percentage <= percentage,
            GradeScale.max_percentage >= percentage,
        )
        .order_by(GradeScale.min_percentage.desc())
        .first()
    )
    if grade_scale:
        return grade_scale.grade, grade_scale.gpa
    return None, None


def build_result_out(result: ExamResult, exam_paper: ExamPaper, db: Session, org_id: int) -> ExamResultOut:
    grade, gpa = calculate_grade_gpa(result.obtained_marks, exam_paper.total_marks, db, org_id)
    return ExamResultOut(
        id=result.id,
        exam_paper_id=result.exam_paper_id,
        student_enrollment_id=result.student_enrollment_id,
        obtained_marks=result.obtained_marks,
        grade=grade,
        gpa=gpa,
    )


# ─────────────────────────────────────────────
# POST /  — single upsert
# ─────────────────────────────────────────────
@router.post("", response_model=ExamResultOut, status_code=status.HTTP_201_CREATED)
def create_exam_result(
    result_in: ExamResultCreate,
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user),
    active_session=Depends(get_active_session),
):
    exam_paper = (
        db.query(ExamPaper)
        .join(Exam)
        .join(Term)
        .filter(
            ExamPaper.id == result_in.exam_paper_id,
            Exam.organization_id == current_user.org_id,
            Term.academic_year_id == active_session.id,
        )
        .first()
    )
    if not exam_paper:
        raise HTTPException(status_code=404, detail="Exam paper not found")

    enrollment = (
        db.query(StudentEnrollment)
        .join(Student)
        .filter(
            StudentEnrollment.id == result_in.student_enrollment_id,
            StudentEnrollment.classroom_id == exam_paper.classroom_id,
            StudentEnrollment.session_id == active_session.id,
            StudentEnrollment.is_active == True,
            Student.organization_id == current_user.org_id,
        )
        .first()
    )
    if not enrollment:
        raise HTTPException(status_code=404, detail="Student is not enrolled in this classroom")

    if result_in.obtained_marks > exam_paper.total_marks:
        raise HTTPException(
            status_code=400,
            detail=f"Marks obtained ({result_in.obtained_marks}) cannot exceed total marks ({exam_paper.total_marks})",
        )

    result = (
        db.query(ExamResult)
        .filter(
            ExamResult.exam_paper_id == exam_paper.id,
            ExamResult.student_enrollment_id == enrollment.id,
        )
        .first()
    )

    if result:
        result.obtained_marks = result_in.obtained_marks
    else:
        result = ExamResult(
            exam_paper_id=exam_paper.id,
            student_enrollment_id=enrollment.id,
            obtained_marks=result_in.obtained_marks,
        )
        db.add(result)

    db.commit()
    db.refresh(result)
    return build_result_out(result, exam_paper, db, current_user.org_id)


# ─────────────────────────────────────────────
# POST /bulk  — bulk upsert
# ─────────────────────────────────────────────
@router.post("/bulk", response_model=BulkExamResultOut, status_code=status.HTTP_201_CREATED)
def create_exam_results_bulk(
    results_in: List[ExamResultCreate],
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user),
    active_session=Depends(get_active_session),
):
    if not results_in:
        raise HTTPException(status_code=400, detail="No results provided")

    # Cache exam papers — avoids N DB hits when all rows share the same paper
    exam_paper_cache: dict[int, ExamPaper] = {}

    def get_exam_paper(exam_paper_id: int) -> ExamPaper | None:
        if exam_paper_id not in exam_paper_cache:
            exam_paper_cache[exam_paper_id] = (
                db.query(ExamPaper)
                .join(Exam)
                .join(Term)
                .filter(
                    ExamPaper.id == exam_paper_id,
                    Exam.organization_id == current_user.org_id,
                    Term.academic_year_id == active_session.id,
                )
                .first()
            )
        return exam_paper_cache[exam_paper_id]

    succeeded_objects: list[tuple[ExamResult, ExamPaper]] = []
    failed: list[dict] = []

    for i, result_in in enumerate(results_in):
        try:
            exam_paper = get_exam_paper(result_in.exam_paper_id)
            if not exam_paper:
                raise HTTPException(status_code=404, detail="Exam paper not found")

            enrollment = (
                db.query(StudentEnrollment)
                .join(Student)
                .filter(
                    StudentEnrollment.id == result_in.student_enrollment_id,
                    StudentEnrollment.classroom_id == exam_paper.classroom_id,
                    StudentEnrollment.session_id == active_session.id,
                    StudentEnrollment.is_active == True,
                    Student.organization_id == current_user.org_id,
                )
                .first()
            )
            if not enrollment:
                raise HTTPException(
                    status_code=404,
                    detail=f"Enrollment {result_in.student_enrollment_id} not found in this classroom",
                )

            if result_in.obtained_marks > exam_paper.total_marks:
                raise HTTPException(
                    status_code=400,
                    detail=f"Marks ({result_in.obtained_marks}) exceed total marks ({exam_paper.total_marks})",
                )

            result = (
                db.query(ExamResult)
                .filter(
                    ExamResult.exam_paper_id == exam_paper.id,
                    ExamResult.student_enrollment_id == enrollment.id,
                )
                .first()
            )

            if result:
                result.obtained_marks = result_in.obtained_marks
            else:
                result = ExamResult(
                    exam_paper_id=exam_paper.id,
                    student_enrollment_id=enrollment.id,
                    obtained_marks=result_in.obtained_marks,
                )
                db.add(result)

            db.flush()
            succeeded_objects.append((result, exam_paper))

        except HTTPException as e:
            failed.append({
                "index": i,
                "student_enrollment_id": result_in.student_enrollment_id,
                "exam_paper_id": result_in.exam_paper_id,
                "error": e.detail,
            })

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Bulk commit failed: {str(e)}")

    succeeded_out: list[ExamResultOut] = []
    for result, exam_paper in succeeded_objects:
        db.refresh(result)
        succeeded_out.append(build_result_out(result, exam_paper, db, current_user.org_id))

    return {"succeeded": succeeded_out, "failed": failed}


# ─────────────────────────────────────────────
# GET /exam/{exam_id}
# ─────────────────────────────────────────────
@router.get("/exam/{exam_id}", response_model=List[ExamResultOut])
def get_exam_results(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user),
    active_session=Depends(get_active_session),
):
    results = (
        db.query(ExamResult)
        .join(ExamPaper, ExamResult.exam_paper_id == ExamPaper.id)
        .join(Exam, ExamPaper.exam_id == Exam.id)
        .join(Term, Exam.term_id == Term.id)
        .filter(
            ExamPaper.exam_id == exam_id,
            Exam.organization_id == current_user.org_id,
            Term.academic_year_id == active_session.id,
        )
        .all()
    )

    return [
        build_result_out(r, r.exam_paper, db, current_user.org_id)
        for r in results
    ]


# ─────────────────────────────────────────────
# GET /student/{student_id}
# ─────────────────────────────────────────────
@router.get("/student/{student_id}", response_model=List[ExamResultOut])
def get_student_results(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user),
    active_session=Depends(get_active_session),
):
    student = db.query(Student).filter(
        Student.id == student_id,
        Student.organization_id == current_user.org_id,
    ).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    enrollment_ids = [
        e.id for e in db.query(StudentEnrollment).filter(
            StudentEnrollment.student_id == student.id,
            StudentEnrollment.is_active == True,
            StudentEnrollment.session_id == active_session.id,
        ).all()
    ]
    if not enrollment_ids:
        return []

    results = (
        db.query(ExamResult)
        .join(ExamPaper)
        .join(Exam)
        .join(Term)
        .filter(
            ExamResult.student_enrollment_id.in_(enrollment_ids),
            Exam.organization_id == current_user.org_id,
            Term.academic_year_id == active_session.id,
        )
        .all()
    )

    return [
        build_result_out(r, r.exam_paper, db, current_user.org_id)
        for r in results
    ]


# ─────────────────────────────────────────────
# GET /{result_id}  — must stay LAST
# ─────────────────────────────────────────────
@router.get("/{result_id}", response_model=ExamResultOut)
def get_exam_result(
    result_id: int,
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user),
):
    result = (
        db.query(ExamResult)
        .join(ExamPaper)
        .join(Exam)
        .filter(
            ExamResult.id == result_id,
            Exam.organization_id == current_user.org_id,
        )
        .first()
    )
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")
    return build_result_out(result, result.exam_paper, db, current_user.org_id)


# ─────────────────────────────────────────────
# DELETE /{result_id}
# ─────────────────────────────────────────────
@router.delete("/{result_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exam_result(
    result_id: int,
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user),
):
    result = (
        db.query(ExamResult)
        .join(ExamPaper)
        .join(Exam)
        .filter(
            ExamResult.id == result_id,
            Exam.organization_id == current_user.org_id,
        )
        .first()
    )
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")

    db.delete(result)
    db.commit()