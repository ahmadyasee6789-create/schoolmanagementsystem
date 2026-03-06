from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import date

from app.schemas.exams import ExamCreate, ExamUpdate, ExamOut
from app.models.exams import Exam, Term
from app.models.users import OrganizationMember
from app.db.session import get_db
from app.routers.auth import get_current_user

router = APIRouter(prefix="/exams", tags=["Exams"])

# -------------------------
# GET all exams for org
# -------------------------
@router.get("/", response_model=List[ExamOut])
def get_exams(
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user),
):
    exams = db.query(Exam).filter(Exam.organization_id == current_user.org_id).all()
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
@router.post("/", response_model=ExamOut, status_code=status.HTTP_201_CREATED)
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
    exam = db.query(Exam).filter(
        Exam.id == exam_id,
        Exam.organization_id == current_user.org_id
    ).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    # Prevent editing if locked
    if exam.is_locked:
        raise HTTPException(status_code=400, detail="Cannot update a locked exam")

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
    exam = db.query(Exam).filter(
        Exam.id == exam_id,
        Exam.organization_id == current_user.org_id
    ).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    # Prevent deletion if published or locked
    if exam.is_published or exam.is_locked:
        raise HTTPException(status_code=400, detail="Cannot delete a published or locked exam")

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
    exam = db.query(Exam).filter(
        Exam.id == exam_id,
        Exam.organization_id == current_user.org_id
    ).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    if exam.is_published:
        raise HTTPException(status_code=400, detail="Exam is already published")
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
    exam = db.query(Exam).filter(
        Exam.id == exam_id,
        Exam.organization_id == current_user.org_id
    ).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    if exam.is_locked:
        raise HTTPException(status_code=400, detail="Exam is already locked")
    exam.is_locked = True
    db.commit()
    db.refresh(exam)
    return exam