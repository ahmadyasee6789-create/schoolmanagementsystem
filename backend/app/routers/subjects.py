from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session, contains_eager, joinedload
from sqlalchemy import and_
from typing import List

from app.db.session import get_db
from app.models.users import User, OrganizationMember
from app.models.exams import Subject, ClassSubject
from app.schemas.subjects import SubjectCreate, SubjectUpdate, SubjectResponse, ClassSubjectCreate, ClassSubjectResponse
from app.routers.auth import get_current_user
from app.models.classroom import Classroom, Grade
from app.dependencies import get_active_session
from app.schemas.subjects import BulkSubjectsCreate, BulkSubjectsOut, BulkClassSubjectsCreate, BulkClassSubjectsOut
from app.services.subject_management import mutate_subject, bulk_create_subjects, assign_subjects, remove_subject, remove_assignment

router = APIRouter(prefix="/subjects", tags=["Subjects"])

@router.post("", response_model=SubjectResponse)
def create_subject(
    subject_data: SubjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    active_session=Depends(get_active_session)
):
    return mutate_subject(db, current_user, active_session, subject_data)


@router.post("/bulk", response_model=BulkSubjectsOut)
def create_multiple_subjects(request: BulkSubjectsCreate, db: Session = Depends(get_db),
                             current_user=Depends(get_current_user), active_session=Depends(get_active_session)):
    return bulk_create_subjects(db, current_user, active_session, request)


@router.post("/assign-to-class/bulk", response_model=BulkClassSubjectsOut)
def assign_multiple_subjects(request: BulkClassSubjectsCreate, db: Session = Depends(get_db),
                             current_user=Depends(get_current_user), active_session=Depends(get_active_session)):
    return assign_subjects(db, current_user, active_session, request.subject_ids, request.classroom_id, bulk=True)


@router.get("/assignments", response_model=List[ClassSubjectResponse])
def get_all_assignments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    active_session=Depends(get_active_session)
):
    
    if current_user.org_id is None:
        raise HTTPException(status_code=403, detail="User is not a member of any organization")
    assignments = (
        db.query(ClassSubject)
        .join(Classroom)
        .join(Grade)
        .join(Subject)
        .options(
            contains_eager(ClassSubject.classroom).joinedload(Classroom.grade),
            contains_eager(ClassSubject.subject),
            joinedload(ClassSubject.teacher).joinedload(OrganizationMember.user),
        )
        .filter(Classroom.organization_id == current_user.org_id,
                Classroom.academic_year_id == active_session.id,
                Grade.organization_id == current_user.org_id,
                Subject.organization_id == current_user.org_id,
                Subject.session_id == active_session.id)
        .all()
    )

    result = []

    for a in assignments:
        result.append({
            "id": a.id,
            "classroom_id": a.classroom_id,
            "subject_id": a.subject_id,
            "teacher_member_id": a.teacher_member_id,
            "classroom_name": a.classroom.grade.name if a.classroom.grade else "",
            "section": a.classroom.section,
            "subject_name": a.subject.name if a.subject else "",
            "teacher_name": a.teacher.user.full_name if a.teacher and a.teacher.user else None
        })

    return result

@router.delete("/assignments/{assignment_id}", status_code=204, response_class=Response)
def delete_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    active_session=Depends(get_active_session),
):
    remove_assignment(db, current_user, active_session, assignment_id)
    return Response(status_code=204)


@router.get("", response_model=List[SubjectResponse])
def get_subjects(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    active_session=Depends(get_active_session)
):
    """Get all subjects for the current organization"""
    subjects = db.query(Subject).filter(
        Subject.organization_id == current_user.org_id,
        Subject.session_id==active_session.id
    ).order_by(Subject.id).offset(skip).limit(limit).all()
    
    return subjects

@router.get("/{subject_id}", response_model=SubjectResponse)
def get_subject(
    subject_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    active_session=Depends(get_active_session)
):
    """Get a specific subject by ID"""
    subject = db.query(Subject).filter(
        and_(
            Subject.id == subject_id,
            Subject.organization_id == current_user.org_id,
            Subject.session_id==active_session.id
        )
    ).first()
    
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    
    return subject

@router.put("/{subject_id}", response_model=SubjectResponse)
def update_subject(
    subject_id: int,
    subject_data: SubjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    active_session=Depends(get_active_session)
):
    return mutate_subject(db, current_user, active_session, subject_data, subject_id=subject_id)


@router.delete("/{subject_id}")
def delete_subject(
    subject_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    active_session=Depends(get_active_session)
):
    return remove_subject(db, current_user, active_session, subject_id)


# ClassSubject endpoints (assign subjects to classes)
@router.post("/assign-to-class", response_model=ClassSubjectResponse)
def assign_subject_to_class(
    assignment: ClassSubjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    active_session=Depends(get_active_session)
):
    return assign_subjects(db, current_user, active_session, [assignment.subject_id],
                           assignment.classroom_id, teacher_member_id=assignment.teacher_member_id)
