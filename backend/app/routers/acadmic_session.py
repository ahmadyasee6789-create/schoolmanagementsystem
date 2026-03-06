# app/routers/academic_session.py
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.models.academic_session import AcademicSession
from app.schemas.academic_session import AcademicSessionCreate, AcademicSessionOut
from app.db.session import get_db
from app.routers.auth import get_current_user

router = APIRouter(prefix="/sessions", tags=["Academic Sessions"])


# -------------------------------------------------------------------
# LIST ALL SESSIONS
# -------------------------------------------------------------------
@router.get("/", response_model=List[AcademicSessionOut])
def get_sessions(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return (
        db.query(AcademicSession)
        .filter(AcademicSession.organization_id == current_user.org_id)
        .all()
    )


# -------------------------------------------------------------------
# GET ACTIVE SESSION  ← new, required by the students page
# -------------------------------------------------------------------
@router.get("/active", response_model=AcademicSessionOut)
def get_active_session(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Return the single active academic session for the organisation."""
    session = (
        db.query(AcademicSession)
        .filter(
            AcademicSession.organization_id == current_user.org_id,
            AcademicSession.is_active == True,
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="No active academic session found")
    return session


# -------------------------------------------------------------------
# CREATE SESSION
# -------------------------------------------------------------------
@router.post("/", response_model=AcademicSessionOut)
def create_session(
    data: AcademicSessionCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    existing = (
        db.query(AcademicSession)
        .filter(
            AcademicSession.name == data.name,
            AcademicSession.organization_id == current_user.org_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Session already exists")

    if data.start_date >= data.end_date:
        raise HTTPException(status_code=400, detail="Start date must be before end date")

    session = AcademicSession(
        name=data.name,
        start_date=data.start_date,
        end_date=data.end_date,
        is_active=data.is_active,
        organization_id=current_user.org_id,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


# -------------------------------------------------------------------
# ACTIVATE SESSION
# -------------------------------------------------------------------
@router.put("/{session_id}/activate", response_model=AcademicSessionOut)
def activate_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    session_obj = (
        db.query(AcademicSession)
        .filter(
            AcademicSession.organization_id == current_user.org_id,
            AcademicSession.id == session_id,
        )
        .first()
    )
    if not session_obj:
        raise HTTPException(status_code=404, detail="Session not found")

    # Deactivate every other session for this org
    db.query(AcademicSession).filter(
        AcademicSession.organization_id == current_user.org_id,
        AcademicSession.is_active == True,
        AcademicSession.id != session_id,
    ).update({AcademicSession.is_active: False}, synchronize_session=False)

    session_obj.is_active = True
    db.commit()
    db.refresh(session_obj)
    return session_obj