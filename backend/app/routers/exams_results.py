# app/routers/exam_results.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import case, text, tuple_, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, contains_eager
from sqlalchemy.orm.attributes import set_committed_value
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
from app.services.grade_scales import lock_scale_organization

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
def mark_percentage(marks: int, total_marks: int):
    return (marks / total_marks) * 100 if total_marks > 0 else 0


def calculate_grade_gpa(marks: int, total_marks: int, db: Session, org_id: int):
    percentage = mark_percentage(marks, total_marks)
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
    return result_out(result, grade, gpa)


def result_out(result: ExamResult, grade: str | None, gpa: float | None) -> ExamResultOut:
    return ExamResultOut(
        id=result.id,
        exam_paper_id=result.exam_paper_id,
        student_enrollment_id=result.student_enrollment_id,
        obtained_marks=result.obtained_marks,
        grade=grade,
        gpa=gpa,
    )


def results_with_grades(results, db: Session, org_id: int):
    if not results:
        return []
    scales = db.query(GradeScale).filter(
        GradeScale.organization_id == org_id,
    ).order_by(GradeScale.min_percentage.desc()).all()
    response = []
    for result in results:
        percentage = mark_percentage(result.obtained_marks, result.exam_paper.total_marks)
        scale = next((item for item in scales if item.min_percentage <= percentage <= item.max_percentage), None)
        response.append(result_out(result, scale.grade if scale else None, scale.gpa if scale else None))
    return response


def editable_exam_paper(db: Session, paper_id: int, org_id: int, session_id: int) -> ExamPaper:
    # Serialize with the exam lock action so a save cannot cross a committed lock.
    query = (
        db.query(ExamPaper, Exam.is_locked, Exam.is_published)
        .join(Exam)
        .join(Term)
        .filter(
            ExamPaper.id == paper_id,
            Exam.organization_id == org_id,
        )
    )
    if session_id is not None:
        query = query.filter(Term.academic_year_id == session_id)
    row = query.with_for_update(of=Exam).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Exam paper not found")
    paper, locked, published = row
    if locked:
        raise HTTPException(status_code=409, detail="Exam is locked")
    if published:
        raise HTTPException(status_code=409, detail="Exam is published; an administrator must reopen it before corrections")
    return paper


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
    lock_scale_organization(db, current_user.org_id)
    exam_paper = editable_exam_paper(db, result_in.exam_paper_id, current_user.org_id, active_session.id)

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
    try:
        if db.get_bind().dialect.name == "postgresql":
            # Keep a save from waiting indefinitely behind another writer. These
            # limits apply only to this transaction and reset on commit/rollback.
            db.execute(text("SET LOCAL lock_timeout = '10s'"))
            db.execute(text("SET LOCAL statement_timeout = '25s'"))
        lock_scale_organization(db, current_user.org_id)
        session_id = active_session.id
        paper_ids = sorted({row.exam_paper_id for row in results_in})
        enrollment_ids = {row.student_enrollment_id for row in results_in}

        # Match lifecycle writers' organization-then-exam lock order, while
        # loading all requested paper definitions and statuses in one round trip.
        paper_rows = db.query(ExamPaper, Exam.is_locked, Exam.is_published).join(Exam).join(Term).filter(
            ExamPaper.id.in_(paper_ids),
            Exam.organization_id == current_user.org_id,
            Term.organization_id == current_user.org_id,
            Term.academic_year_id == session_id,
        ).populate_existing().order_by(ExamPaper.exam_id, ExamPaper.id).with_for_update(of=Exam).all()
        papers = {paper.id: (paper, locked, published) for paper, locked, published in paper_rows}
        enrollments = {enrollment.id: enrollment for enrollment in db.query(StudentEnrollment).join(Student).filter(
            StudentEnrollment.id.in_(enrollment_ids),
            StudentEnrollment.session_id == session_id,
            StudentEnrollment.is_active == True,
            Student.organization_id == current_user.org_id,
        ).populate_existing().all()}
        keys = {(row.exam_paper_id, row.student_enrollment_id) for row in results_in
                if row.exam_paper_id in papers and row.student_enrollment_id in enrollments}
        existing = { (result.exam_paper_id, result.student_enrollment_id): result
                    for result in db.query(ExamResult).filter(
                        tuple_(ExamResult.exam_paper_id, ExamResult.student_enrollment_id).in_(keys),
                    ).populate_existing().with_for_update().all()} if keys else {}

        succeeded_objects: list[tuple[ExamResult, ExamPaper]] = []
        failed: list[dict] = []
        updates: dict[int, int] = {}
        for index, row in enumerate(results_in):
            state = papers.get(row.exam_paper_id)
            enrollment = enrollments.get(row.student_enrollment_id)
            error = None
            if state is None:
                error = "Exam paper not found"
            elif state[1]:
                error = "Exam is locked"
            elif state[2]:
                error = "Exam is published; an administrator must reopen it before corrections"
            elif enrollment is None or enrollment.classroom_id != state[0].classroom_id:
                error = f"Enrollment {row.student_enrollment_id} not found in this classroom"
            elif state[0].total_marks is None or state[0].total_marks <= 0:
                error = "Exam paper total marks need correction before saving results"
            elif row.obtained_marks > state[0].total_marks:
                error = f"Marks ({row.obtained_marks}) exceed total marks ({state[0].total_marks})"
            if error is not None:
                failed.append(dict(index=index, student_enrollment_id=row.student_enrollment_id,
                                   exam_paper_id=row.exam_paper_id, error=error))
                continue
            key = (row.exam_paper_id, row.student_enrollment_id)
            result = existing.get(key)
            if result is None:
                result = ExamResult(exam_paper_id=row.exam_paper_id, student_enrollment_id=enrollment.id)
                db.add(result)
                existing[key] = result
            if result.id is None:
                result.obtained_marks = row.obtained_marks
            else:
                updates[result.id] = row.obtained_marks
            succeeded_objects.append((result, state[0]))

        db.flush()
        if updates:
            # A single CASE update also avoids drivers whose executemany still
            # performs a remote round trip per row. IDs come only from scoped,
            # validated, locked results above; duplicate input keeps last value.
            changed = db.execute(update(ExamResult).where(ExamResult.id.in_(updates)).values(
                obtained_marks=case(updates, value=ExamResult.id),
            ).execution_options(synchronize_session=False))
            if changed.rowcount != len(updates):
                raise HTTPException(409, "Saved marks changed during this request. Read saved marks before retrying.")
            for result in existing.values():
                if result.id in updates:
                    set_committed_value(result, "obtained_marks", updates[result.id])
        scales = db.query(GradeScale).filter(GradeScale.organization_id == current_user.org_id).order_by(
            GradeScale.min_percentage.desc(),
        ).all() if succeeded_objects else []
        succeeded_out = []
        for result, paper in succeeded_objects:
            percentage = mark_percentage(result.obtained_marks, paper.total_marks)
            scale = next((band for band in scales if band.min_percentage <= percentage <= band.max_percentage), None)
            succeeded_out.append(result_out(result, scale.grade if scale else None, scale.gpa if scale else None))
        # Materialize the response before commit expires ORM attributes. Never
        # refresh every result or query the grading scale once per saved cell.
        validated = BulkExamResultOut(succeeded=succeeded_out, failed=failed)
        response = {"succeeded": validated.succeeded, "failed": validated.failed}
        db.commit()
        return response
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Marks conflicted with another request. Read saved marks before retrying.") from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(503, "Could not confirm the save. Read saved marks before retrying; your edits can be retained.") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(500, "Could not confirm the save. Read saved marks before retrying.") from exc


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
        .options(contains_eager(ExamResult.exam_paper))
        .join(Exam, ExamPaper.exam_id == Exam.id)
        .join(Term, Exam.term_id == Term.id)
        .filter(
            ExamPaper.exam_id == exam_id,
            Exam.organization_id == current_user.org_id,
            Term.academic_year_id == active_session.id,
            ExamResult.obtained_marks.is_not(None),
        )
        .all()
    )

    return results_with_grades(results, db, current_user.org_id)


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
        .options(contains_eager(ExamResult.exam_paper))
        .join(Exam)
        .join(Term)
        .filter(
            ExamResult.student_enrollment_id.in_(enrollment_ids),
            Exam.organization_id == current_user.org_id,
            Term.academic_year_id == active_session.id,
        )
        .all()
    )

    return results_with_grades(results, db, current_user.org_id)


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
    lock_scale_organization(db, current_user.org_id)
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

    editable_exam_paper(db, result.exam_paper_id, current_user.org_id, None)
    db.delete(result)
    db.commit()
