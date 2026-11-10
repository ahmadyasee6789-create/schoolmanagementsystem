"""Transactional, scoped commands for destructive exam-paper operations."""
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.models.classroom import Classroom
from app.models.exams import Exam, ExamPaper, ExamResult, Subject, Term
from app.services.exam_editing import lock_exam_record, require_editable


def require_exam_paper_admin(user):
    if user.org_id is None:
        raise HTTPException(403, "School membership is required")
    if user.org_role != "admin":
        raise HTTPException(403, "Only school administrators can delete exam papers")


def scoped_exam_paper(db, org_id, session_id, paper_id, *, lock=False):
    query = (
        db.query(ExamPaper)
        .join(Exam, ExamPaper.exam_id == Exam.id)
        .join(Term, Exam.term_id == Term.id)
        .join(Classroom, ExamPaper.classroom_id == Classroom.id)
        .join(Subject, ExamPaper.subject_id == Subject.id)
        .filter(
            ExamPaper.id == paper_id,
            Exam.organization_id == org_id,
            Term.organization_id == org_id,
            Term.academic_year_id == session_id,
            Classroom.organization_id == org_id,
            Classroom.academic_year_id == session_id,
            Subject.organization_id == org_id,
            Subject.session_id == session_id,
        )
    )
    if lock:
        query = query.with_for_update(of=ExamPaper)
    return query.first()


def deletion_preview(db, user, active_session, paper_id):
    """Return the exact current-session paper and saved-mark count for confirmation."""
    require_exam_paper_admin(user)
    paper = scoped_exam_paper(db, user.org_id, active_session.id, paper_id)
    if paper is None:
        raise HTTPException(404, "Exam paper not found")
    return {
        "paper_id": paper.id,
        "exam_name": paper.exam.name,
        "classroom_name": f"{paper.classroom.grade.name} {paper.classroom.section}",
        "subject_name": paper.subject.name,
        "total_marks": paper.total_marks,
        "result_count": db.query(ExamResult).filter(ExamResult.exam_paper_id == paper.id).count(),
    }


def delete_paper_with_results(db, user, active_session, paper_id):
    """Delete one active-session paper and only its saved results in one transaction."""
    require_exam_paper_admin(user)
    try:
        # Resolve the paper under the session and tenant boundary before taking
        # locks. The lookup is repeated after the exam lock to close the gap
        # between authorization and mutation.
        candidate = scoped_exam_paper(db, user.org_id, active_session.id, paper_id)
        if candidate is None:
            raise HTTPException(404, "Exam paper not found")

        # Keep the established lock order: organization, then exam.
        exam = lock_exam_record(db, user.org_id, candidate.exam_id)
        require_editable(exam)

        paper = scoped_exam_paper(db, user.org_id, active_session.id, paper_id, lock=True)
        if paper is None:
            raise HTTPException(404, "Exam paper not found")

        deleted_marks = (
            db.query(ExamResult)
            .filter(ExamResult.exam_paper_id == paper.id)
            .delete(synchronize_session=False)
        )
        db.delete(paper)
        db.flush()
        db.commit()
        return {"paper_id": paper_id, "deleted_marks": deleted_marks}
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Exam paper deletion conflicted; refresh and retry") from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(503, "Could not confirm exam paper deletion. Refresh before retrying") from exc
    except Exception:
        db.rollback()
        raise
