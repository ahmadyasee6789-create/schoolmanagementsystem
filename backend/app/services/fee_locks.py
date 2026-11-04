"""Shared financial write ordering: organization before payment and obligation."""
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models.users import Organization


def lock_financial_organization(db: Session, org_id: int):
    """One ordering for generation, request keys and receipt sequences per school.

    This intentionally serializes financial writes within one organization. It
    avoids another counter/reservation table in Phase 1. Never use skip_locked.
    """
    organization = db.query(Organization).filter(Organization.id == org_id).with_for_update().first()
    if organization is None:
        raise HTTPException(403, "An organization membership is required")
    return organization


