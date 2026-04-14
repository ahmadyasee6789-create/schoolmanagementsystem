from datetime import date
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status


from sqlalchemy.orm import Session,joinedload
from app.db.session import get_db
from app.routers.auth import get_current_user
from app.models.users import User,OrganizationMember
from app.models.classroom import Classroom, Grade
from app.models.attendance import Attendance
from app.schemas.attendence import AttendanceCreate
from app.schemas.classroom import AssignTeacherRequest, ClassroomCreate


router=APIRouter(prefix="/classes", tags=["Classes"])


@router.get("")
def get_classes(
    db: Session = Depends(get_db),
    current_user:User = Depends(get_current_user),
):
    # Get user's organization
    membership = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.user_id == current_user.id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="User not part of any organization")

    # Query classrooms with teacher info
    classes=(
        db.query(Classroom)
        .options(
            joinedload(Classroom.grade),
            joinedload(Classroom.class_teacher)
        ).filter(Classroom.organization_id==current_user.org_id)
        .all()
    )
    

    result = []
    for c in classes:
        result.append({
            "id": c.id,
            "grade_id": c.grade_id,
            "grade_name": c.grade.name if c.grade else None,          # from grade relationship
            "section": c.section,
            "class_name": f"{c.grade.name} " if c.grade else c.section,
            "teacher_id": c.class_teacher_member_id if c.class_teacher and c.class_teacher.user else None,    # from user relationship
            "teacher_name": c.class_teacher.user.full_name if c.class_teacher else None,  # from user relationship
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
