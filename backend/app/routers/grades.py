from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.routers.auth import get_current_user
from app.models.users import User, OrganizationMember
from app.models.classroom import Grade, Classroom
from app.schemas.classroom import ClassroomCreate, AssignTeacherRequest
from sqlalchemy.orm import joinedload

from app.models.academic_session import AcademicSession
router = APIRouter()
@router.get("/grades")
def list_grades(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.query(Grade).filter(
        Grade.organization_id == current_user.org_id
    ).all()
@router.post("/grades/{grade_id}/sections")
def create_classroom(
    grade_id: int,
    payload: ClassroomCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1️⃣ Check grade exists
    grade = db.query(Grade).filter(
        Grade.id == grade_id,
        Grade.organization_id == current_user.org_id
    ).first()

    if not grade:
        raise HTTPException(status_code=404, detail="Grade not found")
    active_session=db.query(AcademicSession).filter(
        AcademicSession.organization_id==current_user.org_id,
        AcademicSession.is_active==True
    ).first()
    if not active_session:
        raise HTTPException(status_code=400, detail="No active academic session. Please activate a session before creating classes.")

    # 2️⃣ Prevent duplicate section
    existing = db.query(Classroom).filter(
        Classroom.grade_id == grade_id,
        Classroom.section == payload.section.upper(),
        Classroom.organization_id == current_user.org_id,
        Classroom.academic_year_id == active_session.id
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Section already exists")

    # 3️⃣ Create classroom
    classroom = Classroom(
        grade_id=grade_id,
        organization_id=current_user.org_id,
        section=payload.section.upper(),
        academic_year_id=active_session.id )
        

    db.add(classroom)
    db.commit()
    db.refresh(classroom)

    return classroom