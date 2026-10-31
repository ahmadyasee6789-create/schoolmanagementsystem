# app/routers/fee_structure.py
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.db.session import get_db
from app.routers.auth import get_current_user
from app.models.fee_structure import FeeStructure
from app.models.classroom import Classroom, Grade
from app.models.academic_session import AcademicSession
from app.financial_permissions import require_financial_permission
from app.schemas.fee_structure import FeeStructureCreate, FeeStructureUpdate, FeeStructureOut
from app.dependencies import get_active_session

router = APIRouter(prefix="/fee-structure", tags=["Fee Structure"])


# -------------------------------------------------------------------
# HELPERS
# -------------------------------------------------------------------
def require_admin(current_user):
    require_financial_permission(current_user, "manage_fee_structures")


def validate_structure_references(class_id: int, session_id: int, org_id: int, db: Session):
    session = db.query(AcademicSession).filter(
        AcademicSession.id == session_id, AcademicSession.organization_id == org_id,
    ).first()
    classroom = db.query(Classroom).join(Grade, Classroom.grade_id == Grade.id).filter(
        Classroom.id == class_id, Classroom.organization_id == org_id,
        Classroom.academic_year_id == session_id, Grade.organization_id == org_id,
    ).first()
    if session is None or classroom is None:
        raise HTTPException(status_code=400, detail="Invalid classroom or academic session")


def get_structure_or_404(id: int, org_id: int, db: Session) -> FeeStructure:
    structure = db.query(FeeStructure).filter(
        FeeStructure.id == id,
        FeeStructure.organization_id == org_id,
    ).first()
    if not structure:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fee structure not found")
    return structure


def resolve_class_name(structure_id: int, db: Session, org_id: int) -> str | None:
    """Return 'Grade - Section' label for a fee structure's classroom."""
    row = (
        db.query(Grade.name.label("grade_name"), Classroom.section)
        .join(FeeStructure, FeeStructure.class_id == Classroom.id)
        .join(Grade, Classroom.grade_id == Grade.id)
        .filter(FeeStructure.id == structure_id, FeeStructure.organization_id == org_id,
                Classroom.organization_id == org_id, Grade.organization_id == org_id,
                Classroom.academic_year_id == FeeStructure.session_id)
        .first()
    )
    return f"{row.grade_name} - {row.section}" if row else None


def to_response(structure: FeeStructure, db: Session) -> dict:
    return {
        **{c.name: getattr(structure, c.name) for c in FeeStructure.__table__.columns},
        "class_name": resolve_class_name(structure.id, db, structure.organization_id),
    }


# -------------------------------------------------------------------
# GET ALL
# -------------------------------------------------------------------
@router.get("", response_model=List[FeeStructureOut])
def get_all_fee_structures(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    active_session=Depends(get_active_session)
):
    require_financial_permission(current_user, "view_fees")

    rows = (
        db.query(FeeStructure, Grade.name.label("grade_name"), Classroom.section)
        .join(Classroom, FeeStructure.class_id == Classroom.id)
        .join(Grade, Classroom.grade_id == Grade.id)
        .filter(FeeStructure.organization_id == current_user.org_id,
                Classroom.organization_id == current_user.org_id,
                Grade.organization_id == current_user.org_id,
                Classroom.academic_year_id == active_session.id,
                FeeStructure.session_id==active_session.id)
        .all()
    )

    return [
        {
            **{c.name: getattr(fs, c.name) for c in FeeStructure.__table__.columns},
            "class_name": f"{grade_name} - {section}",
        }
        for fs, grade_name, section in rows
    ]


# -------------------------------------------------------------------
# CREATE
# -------------------------------------------------------------------
@router.post("", response_model=FeeStructureOut, status_code=status.HTTP_201_CREATED)
def create_fee_structure(
    data: FeeStructureCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_admin(current_user)
    validate_structure_references(data.class_id, data.session_id, current_user.org_id, db)

    existing = db.query(FeeStructure).filter(
        FeeStructure.class_id == data.class_id,
        FeeStructure.session_id == data.session_id,
        FeeStructure.organization_id == current_user.org_id,
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Fee structure for this class and session already exists",
        )

    structure = FeeStructure(**data.model_dump(), organization_id=current_user.org_id)
    db.add(structure)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Fee structure conflicts with an existing record") from exc
    db.refresh(structure)
    return to_response(structure, db)


# -------------------------------------------------------------------
# UPDATE
# -------------------------------------------------------------------
@router.put("/{id}", response_model=FeeStructureOut)
def update_fee_structure(
    id: int,
    data: FeeStructureUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_admin(current_user)

    structure = get_structure_or_404(id, current_user.org_id, db)
    validate_structure_references(data.class_id, data.session_id, current_user.org_id, db)

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(structure, key, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Fee structure conflicts with an existing record") from exc
    db.refresh(structure)
    return to_response(structure, db)


# -------------------------------------------------------------------
# DELETE
# -------------------------------------------------------------------
@router.delete("/{id}", status_code=status.HTTP_200_OK)
def delete_fee_structure(
    id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_admin(current_user)
    structure = get_structure_or_404(id, current_user.org_id, db)
    db.delete(structure)
    db.commit()
    return {"message": "Fee structure deleted successfully"}
