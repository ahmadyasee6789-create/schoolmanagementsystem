from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.exams import GradeScale
from app.routers.auth import get_current_user
from app.schemas.grade_scale import GradeScaleInput, GradeScaleList, GradeScaleOut
from app.services.grade_scales import coverage, history_locked, organization_id, save_scale

router = APIRouter(prefix="/grade-scales", tags=["Grade Scales"])


@router.get("", response_model=GradeScaleList)
def list_grade_scales(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    org_id = organization_id(current_user)
    rows = db.query(GradeScale).filter(GradeScale.organization_id == org_id).order_by(GradeScale.min_percentage.desc(), GradeScale.id).all()
    locked = history_locked(db, org_id)
    return dict(items=rows, **coverage(rows), history_locked=locked,
                can_manage=current_user.org_role == "admin" and not locked)


@router.post("", response_model=GradeScaleOut, status_code=201)
def create_grade_scale(payload: GradeScaleInput, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return save_scale(db, current_user, payload)


@router.put("/{scale_id}", response_model=GradeScaleOut)
def update_grade_scale(scale_id: int, payload: GradeScaleInput, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return save_scale(db, current_user, payload, scale_id)


@router.delete("/{scale_id}", status_code=204)
def delete_grade_scale(scale_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    save_scale(db, current_user, scale_id=scale_id, delete=True)
    return Response(status_code=204)
