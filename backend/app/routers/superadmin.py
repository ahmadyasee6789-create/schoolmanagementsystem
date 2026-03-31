from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel
from app.db.session import get_db
from app.models.users import User, OrganizationMember, Organization
from app.routers.auth import get_current_user

router = APIRouter(prefix="/superadmin", tags=["Super Admin"])


# ── Guard: superadmin only ──
def require_superadmin(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Reload user to get is_superadmin field
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user or not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Superadmin access required")
    return user


# ── Schema for extend/activate ──
class ExtendPlanRequest(BaseModel):
    plan:       str   # "basic" | "standard" | "premium"
    days:       int   # how many days to extend


# ── GET all organizations ──
@router.get("/organizations")
def get_organizations(
    status: Optional[str] = None,   # filter by status
    db:     Session = Depends(get_db),
    _:      User    = Depends(require_superadmin),
):
    query = db.query(Organization)
    if status:
        query = query.filter(Organization.status == status)

    orgs = query.order_by(Organization.id.desc()).all()

    # Build response with admin info
    result = []
    for org in orgs:
        # Find the admin of this org
        admin_membership = db.query(OrganizationMember).filter(
            OrganizationMember.organization_id == org.id,
            OrganizationMember.role == "admin"
        ).first()

        admin_user = None
        if admin_membership:
            admin_user = db.query(User).filter(
                User.id == admin_membership.user_id
            ).first()

        # Count members and employees
        member_count = db.query(OrganizationMember).filter(
            OrganizationMember.organization_id == org.id
        ).count()

        result.append({
            "id":             org.id,
            "name":           org.name,
            "status":         org.status,
            "plan":           org.plan,
            "trial_ends_at":  org.trial_ends_at,
            "created_at":     org.created_at,
            "member_count":   member_count,
            "admin_name":     admin_user.full_name if admin_user else "—",
            "admin_email":    admin_user.email     if admin_user else "—",
            # days left in trial/plan
            "days_left": max(0, (org.trial_ends_at - datetime.utcnow()).days)
                         if org.trial_ends_at else None,
        })

    return result


# ── ACTIVATE / EXTEND a plan ──
@router.post("/organizations/{org_id}/activate")
def activate_organization(
    org_id:  int,
    payload: ExtendPlanRequest,
    db:      Session = Depends(get_db),
    _:       User    = Depends(require_superadmin),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    org.status        = "active"
    org.plan          = payload.plan
    org.trial_ends_at = datetime.utcnow() + timedelta(days=payload.days)

    db.commit()

    return {
        "message":        f"{org.name} activated on {payload.plan} plan",
        "expires_at":     org.trial_ends_at,
    }


# ── SUSPEND an organization ──
@router.post("/organizations/{org_id}/suspend")
def suspend_organization(
    org_id: int,
    db:     Session = Depends(get_db),
    _:      User    = Depends(require_superadmin),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    org.status = "suspended"
    db.commit()

    return {"message": f"{org.name} has been suspended"}


# ── REACTIVATE a suspended org ──
@router.post("/organizations/{org_id}/reactivate")
def reactivate_organization(
    org_id: int,
    db:     Session = Depends(get_db),
    _:      User    = Depends(require_superadmin),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    org.status = "active"
    db.commit()

    return {"message": f"{org.name} has been reactivated"}


# ── GET dashboard stats ──
@router.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    _:  User    = Depends(require_superadmin),
):
    total      = db.query(Organization).count()
    trial      = db.query(Organization).filter(Organization.status == "trial").count()
    active     = db.query(Organization).filter(Organization.status == "active").count()
    expired    = db.query(Organization).filter(Organization.status == "expired").count()
    suspended  = db.query(Organization).filter(Organization.status == "suspended").count()

    return {
        "total":     total,
        "trial":     trial,
        "active":    active,
        "expired":   expired,
        "suspended": suspended,
    }