from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List
from datetime import date

from app.schemas.exams import ExamCreate, ExamUpdate, ExamOut
from app.models.exams import Exam, Term
from app.models.users import OrganizationMember
from app.db.session import get_db
from app.routers.auth import get_current_user
from app.dependencies import get_active_session
from app.services.grade_scales import require_scale_for_finalization
from app.services.grade_scales import require_admin
from app.models.exam_reopen_snapshot import ExamReopenSnapshot
from app.schemas.exam_reopen import ReopenExamRequest, ReopenExamOut, ExamSnapshotSummary, ExamSnapshotOut
from app.services.exam_editing import lock_exam_record, require_editable
from app.services.exam_reopening import reopen_exam as reopen_exam_service, snapshot_hash
from app.services.exam_snapshot_storage import require_snapshot_storage, snapshot_storage_available, has_reopen_history

router = APIRouter(prefix="/exams", tags=["Exams"])

# -------------------------
# GET all exams for org
# -------------------------
@router.get("", response_model=List[ExamOut])
def get_exams(
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user),
    active_session = Depends(get_active_session)
):
    
    exams = (
    db.query(Exam)
    .join(Term,Exam.term_id==Term.id)
    .filter(
        Exam.organization_id == current_user.org_id,
        Term.academic_year_id==active_session.id 
        ).all())
    return exams


# -------------------------
# GET single exam by ID
# -------------------------
@router.get("/{exam_id}", response_model=ExamOut)
def get_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user),
):
    exam = db.query(Exam).filter(
        Exam.id == exam_id,
        Exam.organization_id == current_user.org_id
    ).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    return exam


# -------------------------
# CREATE exam
# -------------------------
@router.post("", response_model=ExamOut, status_code=status.HTTP_201_CREATED)
def create_exam(
    exam_in: ExamCreate,
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user),
):
    # Validate term
    term = db.query(Term).filter(
        Term.id == exam_in.term_id,
        Term.organization_id == current_user.org_id
    ).first()
    if not term:
        raise HTTPException(status_code=400, detail="Invalid term")

    # Validate date order
    if exam_in.start_date >= exam_in.end_date:
        raise HTTPException(status_code=400, detail="Start date must be before end date")

    # Prevent duplicate exam name in same term
    existing = db.query(Exam).filter(
        Exam.name == exam_in.name,
        Exam.term_id == exam_in.term_id,
        Exam.organization_id == current_user.org_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Exam with this name already exists in the term")

    exam = Exam(
        name=exam_in.name,
        start_date=exam_in.start_date,
        end_date=exam_in.end_date,
        weightage=exam_in.weightage or 0,
        is_published=False,
        is_locked=False,
        term_id=term.id,
        organization_id=current_user.org_id
    )
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return exam


# -------------------------
# UPDATE exam
# -------------------------
@router.put("/{exam_id}", response_model=ExamOut)
def update_exam(
    exam_id: int,
    exam_in: ExamUpdate,
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user),
):
    exam = lock_exam_record(db, current_user.org_id, exam_id)
    require_editable(exam)

    # Validate term if changed
    if exam_in.term_id and exam_in.term_id != exam.term_id:
        term = db.query(Term).filter(
            Term.id == exam_in.term_id,
            Term.organization_id == current_user.org_id
        ).first()
        if not term:
            raise HTTPException(status_code=400, detail="Invalid term")
        exam.term_id = term.id

    # Validate name uniqueness in term
    if exam_in.name and exam_in.name != exam.name:
        existing = db.query(Exam).filter(
            Exam.name == exam_in.name,
            Exam.term_id == exam.term_id,
            Exam.organization_id == current_user.org_id,
            Exam.id != exam.id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Exam with this name already exists in the term")
        exam.name = exam_in.name

    # Validate dates
    if exam_in.start_date:
        exam.start_date = exam_in.start_date
    if exam_in.end_date:
        exam.end_date = exam_in.end_date
    if exam.start_date >= exam.end_date:
        raise HTTPException(status_code=400, detail="Start date must be before end date")

    if exam_in.weightage is not None:
        exam.weightage = exam_in.weightage

    db.commit()
    db.refresh(exam)
    return exam


# -------------------------
# DELETE exam
# -------------------------
@router.delete("/{exam_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user),
):
    exam = lock_exam_record(db, current_user.org_id, exam_id)

    # Prevent deletion if published or locked
    if exam.is_published or exam.is_locked:
        raise HTTPException(status_code=400, detail="Cannot delete a published or locked exam")
    if snapshot_storage_available(db) and db.query(ExamReopenSnapshot.id).filter_by(exam_id=exam.id, organization_id=current_user.org_id).first():
        raise HTTPException(409, "An exam with preserved correction history cannot be deleted")

    db.delete(exam)
    db.commit()
    return None


# -------------------------
# PUBLISH exam
# -------------------------
@router.put("/{exam_id}/publish", response_model=ExamOut)
def publish_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user),
):
    require_admin(current_user)
    exam = lock_exam_record(db, current_user.org_id, exam_id)
    if exam.is_published:
        raise HTTPException(status_code=400, detail="Exam is already published")
    if not exam.is_locked and not has_reopen_history(db, current_user.org_id, exam.id):
        require_scale_for_finalization(db, current_user.org_id)
    exam.is_published = True
    db.commit()
    db.refresh(exam)
    return exam


# -------------------------
# LOCK exam
# -------------------------
@router.put("/{exam_id}/lock", response_model=ExamOut)
def lock_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user),
):
    require_admin(current_user)
    exam = lock_exam_record(db, current_user.org_id, exam_id)
    if exam.is_locked:
        raise HTTPException(status_code=400, detail="Exam is already locked")
    if not exam.is_published and not has_reopen_history(db, current_user.org_id, exam.id):
        require_scale_for_finalization(db, current_user.org_id)
    exam.is_locked = True
    db.commit()
    db.refresh(exam)
    return exam


@router.post("/{exam_id}/reopen", response_model=ReopenExamOut)
def reopen_exam(exam_id: int, payload: ReopenExamRequest, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return reopen_exam_service(db, current_user, exam_id, payload.reason)


@router.get("/{exam_id}/reopen-snapshots", response_model=List[ExamSnapshotSummary])
def list_reopen_snapshots(exam_id: int, limit: int = Query(50, ge=1, le=100), db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    require_admin(current_user)
    require_snapshot_storage(db)
    get_exam(exam_id, db, current_user)
    return db.query(ExamReopenSnapshot).filter_by(exam_id=exam_id, organization_id=current_user.org_id).order_by(ExamReopenSnapshot.id.desc()).limit(limit).all()


@router.get("/{exam_id}/reopen-snapshots/{snapshot_id}", response_model=ExamSnapshotOut)
def get_reopen_snapshot(exam_id: int, snapshot_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    require_admin(current_user)
    require_snapshot_storage(db)
    row = db.query(ExamReopenSnapshot).filter_by(id=snapshot_id, exam_id=exam_id, organization_id=current_user.org_id).first()
    if row is None:
        raise HTTPException(404, "Examination snapshot not found")
    if snapshot_hash(row.snapshot) != row.snapshot_sha256:
        raise HTTPException(409, "Examination snapshot integrity check failed")
    return row
