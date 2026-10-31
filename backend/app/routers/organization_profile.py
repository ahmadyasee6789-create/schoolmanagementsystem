import base64

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.users import Organization
from app.routers.auth import get_current_user
from app.services.school_logo import normalize_school_logo

router = APIRouter(prefix="/organization", tags=["Organization"])


def _organization(db, current_user):
    organization = db.get(Organization, current_user.org_id) if current_user.org_id else None
    if organization is None:
        raise HTTPException(status_code=404, detail="School profile not found")
    return organization


def _profile(organization):
    return {
        "id": organization.id,
        "name": organization.name,
        "logo": "data:image/png;base64," + base64.b64encode(organization.logo).decode("ascii") if organization.logo else None,
    }


@router.get("/profile")
def get_school_profile(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return _profile(_organization(db, current_user))


@router.put("/logo")
def save_school_logo(logo: UploadFile = File(...), db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if current_user.org_role != "admin":
        raise HTTPException(status_code=403, detail="Only school administrators can change the school logo")
    organization = _organization(db, current_user)
    organization.logo = normalize_school_logo(logo)
    db.commit()
    return _profile(organization)


@router.delete("/logo")
def remove_school_logo(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if current_user.org_role != "admin":
        raise HTTPException(status_code=403, detail="Only school administrators can change the school logo")
    organization = _organization(db, current_user)
    organization.logo = None
    db.commit()
    return _profile(organization)
