from fastapi import APIRouter, Depends, HTTPException, status,Body
from sqlalchemy.orm import Session
from jose import jwt, JWTError, ExpiredSignatureError

from datetime import datetime, timedelta
import os
from app.crud.classroom import seed_grades
from  app.db.session import get_db
from  app.models.users import User, OrganizationMember, Organization
from app.schemas.user import UserCreate, UserLogin, UserOut
from fastapi.security import OAuth2PasswordBearer 
from  app.utils.hash import create_refresh_token, hash_password, verify_password, create_access_token
from fastapi_limiter.depends import RateLimiter
import logging
from  app.schemas.auth import RefreshTokenIn, CurrentUser
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Auth"])

# ---------------- CONFIG ----------------
SECRET_KEY = os.environ.get("SECRET_KEY", "your-secret-key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# ---------------- AUTH DEPENDENCY ----------------
from jose import JWTError, ExpiredSignatureError


from sqlalchemy.orm import joinedload

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),

)->CurrentUser:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")

        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")

        user = (
            db.query(User)
            .options(joinedload(User.organization_memberships))
            .filter(User.id == user_id)
            .first()
        )

        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        org_member = (
            user.organization_memberships[0]
            if user.organization_memberships
            else None
        )

        return CurrentUser(
            id=user.id,
            full_name=user.full_name,
            email=user.email,
            org_id=org_member.organization_id if org_member else None,
            org_role=org_member.role if org_member else None,
        )

    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


@router.post("/login")
def login(data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Default values
    org_id   = None
    org_role = None
    org      = None

    # Check organization membership
    org_member = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == user.id
    ).first()

    if org_member:
        org_id   = org_member.organization_id
        org_role = org_member.role
        org      = db.query(Organization).filter(
            Organization.id == org_id
        ).first()

        if org:
            # ── Step 1: Auto-expire trial if time is up ──
            if org.status == "trial" and org.trial_ends_at:
                if datetime.utcnow() > org.trial_ends_at:
                    org.status = "expired"
                    db.commit()

            # ── Step 2: Block if expired ──
            if org.status == "expired":
                raise HTTPException(
                    status_code=403,
                    detail="Your trial has expired. Please contact us to subscribe."
                )

            # ── Step 3: Block if suspended ──
            if org.status == "suspended":
                raise HTTPException(
                    status_code=403,
                    detail="Your account is suspended. Please contact support."
                )

    # Superadmin check
    is_superadmin = getattr(user, "is_superadmin", False)

    # Create tokens
    access_token = create_access_token(
        data={
            "sub":           user.email,
            "user_id":       user.id,
            "type":          "access",
            "org_id":        org_id,
            "org_role":      org_role,
            "is_superadmin": is_superadmin,
        },
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    refresh_token = create_refresh_token(
        data={
            "user_id": user.id,
            "type":    "refresh",
        },
        expires_delta=timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    )

    # Calculate days left
    days_left = None
    if org and org.trial_ends_at:
        days_left = max(0, (org.trial_ends_at - datetime.utcnow()).days)

    # Redirect logic
    if is_superadmin:
        redirect = "/superadmin"
    elif org_member:
        redirect = "/"
    else:
        redirect = "/signup"

    return {
        "access_token": access_token,
        "expires_in":   ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "refresh_token": refresh_token,
        "user": {
            "id":            user.id,
            "full_name":     user.full_name,
            "email":         user.email,
            "org_id":        org_id,
            "org_role":      org_role,
            "is_superadmin": is_superadmin,
        },
        "trial": {
            "days_left": days_left,
            "is_trial":  org.status == "trial" if (org_member and org) else False,
        },
        "redirect": redirect,
    }





# ---------------- CURRENT USER ----------------
@router.get("/me")
def me(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    try:
       payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
       user_id = payload.get("user_id")
       if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # 🔹 Determine org membership dynamically
    org_member = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == user.id
    ).first()
    org_data=db.query(Organization).filter(
        Organization.id == org_member.organization_id
    ).first() if org_member else None
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "org_role": org_member.role if org_member else None,
        "org_id": org_member.organization_id if org_member else None,
        "org_name": org_data.name if org_data else None,
    }


# ---------------- LOGOUT ----------------
@router.post("/logout")
def logout():
    
    return {"message": "Logged out"}




@router.post("/signup")
def signup(payload: UserCreate, db: Session = Depends(get_db)):
    try:
        # Check existing email
        if db.query(User).filter(User.email == payload.email).first():
            raise HTTPException(status_code=400, detail="Email already registered")

        # Create user
        new_user = User(
            full_name=payload.full_name,
            email=payload.email,
            hashed_password=hash_password(payload.password),
        )
        db.add(new_user)
        db.flush()  # 👈 no commit yet

        # Create organization
        new_org = Organization(
            name=payload.organization_name,
            status=        "trial",          # instant access!
           plan=          "trial",
           trial_ends_at= datetime.utcnow() + timedelta(days=14),
        )
        db.add(new_org)
        db.flush()

        # Seed classrooms
        seed_grades(db, new_org.id)

        # Create org membership (admin)
        org_member = OrganizationMember(
            user_id=new_user.id,
            organization_id=new_org.id,
            role="admin"
        )
        db.add(org_member)

        # ✅ One commit only
        db.commit()

        return {
            "message": "Organization created",
            "user_id": new_user.id,
            "organization_id": new_org.id,
            "role": "admin"
        }

    except Exception:
        db.rollback()
        raise


     

        

   
    
@router.post("/refresh")
def refresh_token(payload: RefreshTokenIn):
    try:
        payload_data = jwt.decode(
            payload.refresh_token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        user_id = payload_data.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid refresh token")

        new_access_token = create_access_token(
            data={"user_id": user_id},
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        )

        new_refresh_token = create_refresh_token(
            data={"user_id": user_id},
            expires_delta=timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        )

        return {
            "access_token": new_access_token,
            "refresh_token": new_refresh_token,
            "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        }

    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
