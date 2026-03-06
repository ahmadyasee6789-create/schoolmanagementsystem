# routers/organization_invitations.py
from uuid import uuid4
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.db.session import get_db
from app.routers.auth import get_current_user
from app.models.users import User, Invitation, OrganizationMember
from app.utils.hash import hash_password
from app.utils.email_sender import send_activation_email
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/organization/invitations", tags=["Organization Invitations"])


# Pydantic models
class InviteRequest(BaseModel):
    email: str
    role: str


class AcceptInviteRequest(BaseModel):
    token: str
    password: str
    name: str


# Helper to get user's primary organization
def get_user_organization(user: User, db: Session, organization_id: int = None) -> OrganizationMember:
    query = db.query(OrganizationMember).filter(OrganizationMember.user_id == user.id)
    if organization_id:
        query = query.filter(OrganizationMember.organization_id == organization_id)
    membership = query.first()
    if not membership:
        raise HTTPException(status_code=403, detail="You are not a member of any organization")
    return membership



# ✅ GET all invitations
@router.get("")
def list_invitations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logger.info(f"Listing invitations for user: {current_user.id}")
    membership = get_user_organization(current_user, db)
    return db.query(Invitation).filter(Invitation.organization_id == membership.organization_id).all()



# ✅ CREATE invitation
@router.post("")
def invite_user(
    data: InviteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = get_user_organization(current_user, db)

    # 1️⃣ Only admin can invite
    if membership.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can invite users")

    # 2️⃣ Check if user already exists
    invited_user = db.query(User).filter(User.email == data.email).first()

    if invited_user:
        existing_membership = db.query(OrganizationMember).filter(
            OrganizationMember.user_id == invited_user.id
        ).first()

        if existing_membership:
            raise HTTPException(
                status_code=400,
                detail="User already belongs to an organization"
            )

    # 3️⃣ Check existing invite
    existing_invite = db.query(Invitation).filter(
        Invitation.email == data.email,
        Invitation.organization_id == membership.organization_id,
        Invitation.accepted == False
    ).first()

    if existing_invite:
        raise HTTPException(status_code=400, detail="Invitation already sent")

    # 4️⃣ Create invitation
    token = str(uuid4())
    invite = Invitation(
        email=data.email,
        role=data.role,
        token=token,
        organization_id=membership.organization_id,
        expires_at=datetime.utcnow() + timedelta(days=7),
        accepted=False,
    )

    db.add(invite)
    db.commit()
    db.refresh(invite)

    send_activation_email(to_email=data.email, invite_token=token)

    return {"message": "Invitation sent successfully"}



# ✅ DELETE invitation
@router.delete("/{invite_id}")
def delete_invitation(
    invite_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = get_user_organization(current_user, db)
    
    invite = db.get(Invitation, invite_id)
    if not invite:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    if invite.organization_id != membership.organization_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this invitation")
    
    if membership.role != "admin":
        raise HTTPException(status_code=403, detail="Only organization admins can delete invitations")
    
    db.delete(invite)
    db.commit()
    return {"success": True}


@router.post("/accept")
def accept_invite(data: AcceptInviteRequest, db: Session = Depends(get_db)):
    # 1️⃣ Fetch invitation by token
    invite = db.query(Invitation).filter(
        Invitation.token == data.token,
        Invitation.accepted == False
    ).first()
    
    if not invite or invite.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invalid or expired invite")

    # 2️⃣ Check if user already exists
    user = db.query(User).filter(User.email == invite.email).first()
    if not user:
        # Create new user
        user = User(
            email=invite.email,
            full_name=data.name,
            hashed_password=hash_password(data.password),
        )
        db.add(user)
        db.flush()  # ensures user.id is available

    # 3️⃣ Check existing membership safely
    membership = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == user.id,
        OrganizationMember.organization_id == invite.organization_id
    ).first()

    if membership:
        raise HTTPException(status_code=400, detail="User already belongs to an organization")

    # 4️⃣ Add membership
    membership = OrganizationMember(
        user_id=user.id,
        organization_id=invite.organization_id,
        role=invite.role
    )
    db.add(membership)

    # 5️⃣ Mark invitation accepted
    invite.accepted = True
    db.commit()

    # 6️⃣ Return JWT token
    from app.routers.auth import create_access_token
    access_token = create_access_token(data={"user_id": user.id})
    
    return {
        "message": "Invitation accepted",
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.full_name
        }
    }
