# app/dependencies.py
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.academic_session import AcademicSession
from app.models.users import OrganizationMember
from app.routers.auth import get_current_user

def get_active_session(
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user)
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
        raise HTTPException(status_code=400, detail="No active academic session found")
    return active_session