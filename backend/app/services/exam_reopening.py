"""Explicit administrative correction: preserve first, reopen second, one commit."""
from datetime import datetime, timezone
import hashlib
import json

from fastapi import HTTPException
from sqlalchemy.orm import joinedload

from app.models.academic_session import AcademicSession
from app.models.classroom import Classroom
from app.models.exams import ExamPaper, ExamResult, GradeScale, Term
from app.models.exam_reopen_snapshot import ExamReopenSnapshot
from app.models.student_enrollment import StudentEnrollment
from app.services.exam_editing import lock_exam_record
from app.services.exam_evaluation import evaluate_result
from app.services.exam_snapshot_storage import require_snapshot_storage
from app.services.grade_scales import require_admin


def snapshot_hash(payload):
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")).hexdigest()


def capture_exam(db, exam, actor, reason, captured_at):
    term = db.query(Term).filter(Term.id == exam.term_id, Term.organization_id == actor.org_id).first()
    session = db.query(AcademicSession).filter(AcademicSession.id == term.academic_year_id, AcademicSession.organization_id == actor.org_id).first() if term else None
    if session is None:
        raise HTTPException(409, "Examination session ownership needs review before reopening")
    papers = db.query(ExamPaper).options(joinedload(ExamPaper.subject), joinedload(ExamPaper.classroom).joinedload(Classroom.grade)).filter(
        ExamPaper.exam_id == exam.id,
    ).order_by(ExamPaper.id).all()
    for paper in papers:
        if (paper.subject is None or paper.subject.organization_id != actor.org_id or paper.classroom is None
                or paper.classroom.organization_id != actor.org_id or paper.classroom.academic_year_id != session.id
                or paper.classroom.grade is None or paper.classroom.grade.organization_id != actor.org_id):
            raise HTTPException(409, "Exam-paper ownership needs review before reopening")
    results = db.query(ExamResult).options(joinedload(ExamResult.student_enrollment).joinedload(StudentEnrollment.student)).filter(
        ExamResult.exam_paper_id.in_([paper.id for paper in papers]),
    ).order_by(ExamResult.id).all()
    scales = db.query(GradeScale).filter(GradeScale.organization_id == actor.org_id).order_by(GradeScale.min_percentage.desc(), GradeScale.id).all()
    def grade(percentage):
        return next((scale for scale in scales if scale.min_percentage <= percentage <= scale.max_percentage), None)
    by_paper = {p.id: p for p in papers}
    marks, students, saved_results = {}, {}, []
    for result in results:
        enrollment = result.student_enrollment
        if enrollment is None or enrollment.student is None or enrollment.student.organization_id != actor.org_id or enrollment.session_id != session.id:
            raise HTTPException(409, "Result ownership needs review before reopening")
        student = enrollment.student
        students[enrollment.id] = dict(enrollment_id=enrollment.id, student_id=student.id, classroom_id=enrollment.classroom_id,
                                      student_name=f"{student.first_name} {student.last_name or ''}".strip(), father_name=student.father_name,
                                      admission_no=student.admission_no, roll_number=enrollment.roll_number)
        paper = by_paper[result.exam_paper_id]
        band = grade(result.obtained_marks / paper.total_marks * 100) if result.obtained_marks is not None and paper.total_marks else None
        marks[(enrollment.id, paper.id)] = result.obtained_marks
        saved_results.append(dict(id=result.id, exam_paper_id=paper.id, student_enrollment_id=enrollment.id,
                                  obtained_marks=result.obtained_marks, grade=band.grade if band else None, gpa=band.gpa if band else None))
    for enrollment_id, student in students.items():
        subjects = [dict(name=p.subject.name, total=p.total_marks, obtained=marks.get((enrollment_id,p.id)), **{"pass":p.pass_marks})
                    for p in papers if p.classroom_id == student["classroom_id"]]
        complete = bool(subjects) and all(s["obtained"] is not None for s in subjects)
        evaluation = evaluate_result(subjects) if complete else None
        band = grade(evaluation["percentage"]) if evaluation else None
        student.update(subjects=subjects, evaluation=evaluation, dmc_grade=band.grade if band else None)
    return dict(version=1, administrator_id=actor.id, captured_at=captured_at.isoformat(), reason=reason,
                exam=dict(id=exam.id, organization_id=exam.organization_id, name=exam.name, term_id=exam.term_id,
                          start_date=exam.start_date.isoformat(), end_date=exam.end_date.isoformat(), weightage=exam.weightage,
                          is_locked=exam.is_locked, is_published=exam.is_published),
                session=dict(id=session.id, name=session.name),
                papers=[dict(id=p.id, exam_id=p.exam_id, classroom_id=p.classroom_id, subject_id=p.subject_id, subject_name=p.subject.name,
                             class_label=f"{p.classroom.grade.name} – {p.classroom.section}", total_marks=p.total_marks, pass_marks=p.pass_marks) for p in papers],
                grade_scales=[dict(id=s.id, organization_id=s.organization_id, grade=s.grade, min_percentage=s.min_percentage, max_percentage=s.max_percentage, gpa=s.gpa) for s in scales],
                results=saved_results, students=list(students.values()))


def reopen_exam(db, actor, exam_id, reason):
    require_admin(actor)
    try:
        require_snapshot_storage(db)
        exam = lock_exam_record(db, actor.org_id, exam_id)
        if not (exam.is_locked or exam.is_published):
            raise HTTPException(409, "Exam is already open for corrections")
        captured_at = datetime.now(timezone.utc)
        payload = capture_exam(db, exam, actor, reason, captured_at)
        snapshot = ExamReopenSnapshot(organization_id=actor.org_id, exam_id=exam.id, created_by=actor.id,
                                      created_at=captured_at, reason=reason, snapshot=payload, snapshot_sha256=snapshot_hash(payload))
        db.add(snapshot)
        db.flush()  # The immutable snapshot must exist before either flag changes.
        result = dict(snapshot_id=snapshot.id, created_at=captured_at)
        exam.is_locked = False
        exam.is_published = False
        db.flush()
        result["exam"] = {column.name: getattr(exam, column.name) for column in exam.__table__.columns}
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise
