# app/routers/terms.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.schemas.terms import TermCreate, TermUpdate, TermOut
from app.models.exams import Term
from app.models.users import OrganizationMember
from app.db.session import get_db
from app.routers.auth import get_current_user
from app.models.academic_session import AcademicSession

router = APIRouter(prefix="/terms", tags=["Terms"])

# -------------------------
# GET all terms for org
# -------------------------
@router.get("", response_model=List[TermOut])
def get_terms(
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user),
):
    active_session = (
        db.query(AcademicSession)
        .filter(
            AcademicSession.organization_id == current_user.org_id,
            AcademicSession.is_active == True
        )
        .first()
    )

    if not active_session:
        raise HTTPException(
            status_code=400,
            detail="No active academic session found"
        )

    terms = db.query(Term).filter(
        Term.organization_id == current_user.org_id,
        Term.academic_year_id == active_session.id
    ).all()

    return terms

# -------------------------
# GET term by ID
# -------------------------
@router.get("/{term_id}", response_model=TermOut)
def get_term(
    term_id: int,
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user),
):
    term = db.query(Term).filter(
        Term.id == term_id,
        Term.organization_id == current_user.org_id
    ).first()
    if not term:
        raise HTTPException(status_code=404, detail="Term not found")
    return term

# -------------------------
# CREATE term
# -------------------------
@router.post("", response_model=TermOut, status_code=status.HTTP_201_CREATED)
def create_term(
    term_in: TermCreate,
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user),
):
    active_session = (
    db.query(AcademicSession)
    .filter(
        AcademicSession.organization_id == current_user.org_id,
        AcademicSession.is_active == True
    )
    .first()
)

    if not active_session:
      raise HTTPException(
        status_code=400,
        detail="No active academic session found"
    )
    
    existing = db.query(Term).filter(
        Term.name == term_in.name,
        Term.academic_year_id == active_session.id,
        Term.organization_id == current_user.org_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Term with this name already exists for the selected session")

    term = Term(
        name=term_in.name,
        academic_year_id=active_session.id,
        organization_id=current_user.org_id
    )
    db.add(term)
    db.commit()
    db.refresh(term)
    return term

# -------------------------
# UPDATE term
# -------------------------
@router.put("/{term_id}", response_model=TermOut)
def update_term(
    term_id: int,
    term_in: TermUpdate,
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user),
):
    term = db.query(Term).filter(
        Term.id == term_id,
        Term.organization_id == current_user.org_id
    ).first()
    if not term:
        raise HTTPException(status_code=404, detail="Term not found")

    if term_in.name:
        term.name = term_in.name
    

    db.commit()
    db.refresh(term)
    return term

# -------------------------
# DELETE term
# -------------------------
@router.delete("/{term_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_term(
    term_id: int,
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user),
):
    term = db.query(Term).filter(
        Term.id == term_id,
        Term.organization_id == current_user.org_id
    ).first()
    if not term:
        raise HTTPException(status_code=404, detail="Term not found")
    if term.exams:
       raise HTTPException(
        status_code=400,
        detail="Cannot delete term with existing exams"
    )
    db.delete(term)
    db.commit()
    return None