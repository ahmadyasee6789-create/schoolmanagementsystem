from datetime import date
from typing import Annotated, List
from fastapi import APIRouter, Depends, HTTPException, Query, status


from sqlalchemy.orm import Session,joinedload
from app.db.session import get_db
from app.routers.auth import get_current_user
from app.models.users import User,OrganizationMember
from app.models.classroom import Classroom, Grade
from app.models.attendance import Attendance
from app.models.academic_session import AcademicSession
from app.schemas.attendence import AttendanceCreate
from app.schemas.auth import CurrentUser
from app.schemas.classroom import AssignTeacherRequest, ClassroomCreate


router=APIRouter(prefix="/classes", tags=["Classes"])


@router.get("")
def get_classes(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
    session_id: Annotated[int | None, Query(gt=0)] = None,
):
    # Authentication already loaded this user's organization membership.
    if current_user.org_id is None:
        raise HTTPException(status_code=403, detail="User not part of any organization")
    if session_id is not None and db.query(AcademicSession.id).filter_by(
        id=session_id, organization_id=current_user.org_id,
    ).first() is None:
        raise HTTPException(404, "Academic session not found")

    # Query classrooms with teacher info
    query=(
        db.query(Classroom)
        .options(
            joinedload(Classroom.grade),
            joinedload(Classroom.class_teacher).joinedload(OrganizationMember.user),
        ).filter(Classroom.organization_id==current_user.org_id)
    )
    if session_id is not None:
        query = query.filter(Classroom.academic_year_id == session_id)
    classes = query.all()
    

    result = []
    for c in classes:
        teacher = c.class_teacher.user if c.class_teacher else None
        result.append({
            "id": c.id,
            "grade_id": c.grade_id,
            "grade_name": c.grade.name if c.grade else None,          # from grade relationship
            "section": c.section,
            "class_name": f"{c.grade.name} " if c.grade else c.section,
            "teacher_id": c.class_teacher_member_id if teacher else None,
            "teacher_name": teacher.full_name if teacher else None,
        })
    return result



    



@router.post("/{class_id}/assign-teacher")
def assign_teacher(
    class_id: int,
    payload: AssignTeacherRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Get admin membership
    membership = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == current_user.id
    ).first()

    if not membership or membership.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can assign teachers")

    # Validate teacher
    teacher = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == payload.teacher_id,
        OrganizationMember.organization_id == membership.organization_id,
        OrganizationMember.role == "teacher",
    ).first()

    if not teacher:
        raise HTTPException(status_code=404, detail="Invalid teacher")

    # Get class
    classroom = db.query(Classroom).filter(
        Classroom.id == class_id,
        Classroom.organization_id == membership.organization_id,
    ).first()

    if not classroom:
        raise HTTPException(status_code=404, detail="Class not found")

    # ✅ Assign teacher
    classroom.class_teacher_member_id =teacher.id
    db.commit()
    db.refresh(classroom)

    return {
        "message": "Teacher assigned successfully",
        "class_id": classroom.id,
        "teacher_member_id": classroom.class_teacher_member_id,
        "teacher_user_id": teacher.user_id,
    }
def validate_teacher_class(teacher_id, class_id, db:Session):
    exists = db.query(Classroom).filter(
        Classroom.id == class_id,
        Classroom.class_teacher_member_id == teacher_id
    ).first()

    if not exists:
        raise HTTPException(403, "Not assigned to this class")
