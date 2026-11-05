from fastapi import HTTPException

from app.models.exams import Exam
from app.services.grade_scales import lock_scale_organization


def lock_exam_record(db, org_id, exam_id):
    # All exam writers acquire organization then exam, including bulk saves.
    # This also serializes snapshots against grade-scale administration.
    lock_scale_organization(db, org_id)
    exam = db.query(Exam).filter(Exam.id == exam_id, Exam.organization_id == org_id).populate_existing().with_for_update().first()
    if exam is None:
        raise HTTPException(404, "Exam not found")
    return exam


def require_editable(exam):
    if exam.is_locked:
        raise HTTPException(409, "Exam is locked")
    if exam.is_published:
        raise HTTPException(409, "Exam is published; an administrator must reopen it before corrections")
