from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.routers.auth import get_current_user
from app.db.session import get_db
from app.models.users import User, OrganizationMember

router = APIRouter(prefix="/organization", tags=["Organization"])

@router.get("/team")
def get_org_team(
    role: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    org_id = getattr(current_user, "org_id", None)
    if not org_id:
        raise HTTPException(status_code=403, detail="No organization found")

    membership = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == current_user.id,
        OrganizationMember.organization_id == org_id
    ).first()

    if not membership:
        raise HTTPException(status_code=404, detail="Organization membership not found")

    if membership.role != "admin" and membership.role != "teacher":
        raise HTTPException(status_code=403, detail="Only admins and teachers can access this page")

    # ✅ DEFINE QUERY FIRST (IMPORTANT)
    query = (
        db.query(OrganizationMember, User)
        .join(User, User.id == OrganizationMember.user_id)
        .filter(OrganizationMember.organization_id == org_id)
    )

    # ✅ THEN filter conditionally
    if role:
        query = query.filter(OrganizationMember.role == role)

    members = query.all()

    return [
        {
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": member.role,
            "organization_id": org_id
        }
        for member, user in members
    ]

@router.delete("/team/{user_id}")
def remove_member(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    org_id = current_user.org_id
    membership = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == current_user.id,
        OrganizationMember.organization_id == org_id
    ).first()
    if not membership or membership.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot remove yourself")

    member = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == user_id,
        OrganizationMember.organization_id == org_id
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    db.delete(member)
    # Delete the user from the users table
    user_to_delete = db.query(User).filter(User.id == user_id).first()
    if user_to_delete:
        db.delete(user_to_delete)

    
    db.commit()
    return {"message": "User removed from organization"}