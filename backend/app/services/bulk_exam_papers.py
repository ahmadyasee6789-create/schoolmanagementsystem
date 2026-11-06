"""Create a classroom's selected papers atomically without changing existing papers."""
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import contains_eager

from app.models.academic_session import AcademicSession
from app.models.classroom import Classroom, Grade
from app.models.exams import ClassSubject, ExamPaper, Subject, Term
from app.services.exam_editing import lock_exam_record, require_editable
from app.schemas.exam_paper import BulkExamPaperOut


def create_bulk_exam_papers(db, current_user, request, active_session):
    if current_user.org_role != "admin":
        raise HTTPException(403, "Only school administrators can create multiple exam papers")
    org_id = current_user.org_id
    try:
        # Single-paper writers and lifecycle actions use this same lock order.
        exam = lock_exam_record(db, org_id, request.exam_id)
        require_editable(exam)
        term = db.query(Term).filter_by(id=exam.term_id, organization_id=org_id).first()
        session = db.query(AcademicSession).filter_by(id=active_session.id, organization_id=org_id).first()
        if term is None or session is None or term.academic_year_id != session.id:
            raise HTTPException(404, "Examination not found in the active academic session")
        classroom = db.query(Classroom).join(Grade).options(contains_eager(Classroom.grade)).filter(
            Classroom.id == request.classroom_id,
            Classroom.organization_id == org_id,
            Classroom.academic_year_id == session.id,
            Grade.organization_id == org_id,
        ).first()
        if classroom is None:
            raise HTTPException(404, "Classroom not found in this school and academic session")
        subject_ids = [paper.subject_id for paper in request.papers]
        subjects = {subject.id: subject for subject in db.query(Subject).join(ClassSubject).filter(
            ClassSubject.classroom_id == classroom.id,
            Subject.id.in_(subject_ids),
            Subject.organization_id == org_id,
            Subject.session_id == session.id,
        ).all()}
        if len(subjects) != len(subject_ids):
            raise HTTPException(400, "Every selected subject must belong to this session and be assigned to the classroom")
        existing = {paper.subject_id: paper for paper in db.query(ExamPaper).filter(
            ExamPaper.exam_id == exam.id,
            ExamPaper.classroom_id == classroom.id,
            ExamPaper.subject_id.in_(subject_ids),
        ).all()}
        created, skipped = [], []
        # Ownership and the complete input were checked before the first insert.
        for item in request.papers:
            if item.subject_id in existing:
                skipped.append(existing[item.subject_id])
            else:
                paper = ExamPaper(exam_id=exam.id, classroom_id=classroom.id, **item.model_dump())
                db.add(paper)
                created.append(paper)
        db.flush()

        def output(paper):
            return dict(id=paper.id, exam_id=exam.id, classroom_id=classroom.id,
                        subject_id=paper.subject_id, total_marks=paper.total_marks, pass_marks=paper.pass_marks,
                        exam_name=exam.name, classroom_name=f"{classroom.grade.name} {classroom.section}",
                        subject_name=subjects[paper.subject_id].name)

        response = dict(created_count=len(created), skipped_count=len(skipped),
                        created=[output(paper) for paper in created], skipped=[output(paper) for paper in skipped])
        # Legacy paper columns permit NULLs. Validate the full response before
        # committing so an unreadable existing paper cannot hide a successful write.
        try:
            response = BulkExamPaperOut.model_validate(response).model_dump()
        except ValidationError as exc:
            raise HTTPException(409, "Existing paper data needs review; no new papers were saved") from exc
        db.commit()
        return response
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Exam-paper creation conflicted with another request. Refresh and retry; no partial set was saved.") from exc
    except Exception:
        db.rollback()
        raise
