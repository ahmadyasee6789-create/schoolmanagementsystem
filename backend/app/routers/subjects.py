from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List

from app.db.session import get_db
from app.models.users import User, OrganizationMember
from app.models.exams import Subject, ClassSubject
from app.schemas.subjects import SubjectCreate, SubjectUpdate, SubjectResponse, ClassSubjectCreate, ClassSubjectResponse
from app.routers.auth import get_current_user
from app.models.classroom import Classroom

router = APIRouter(prefix="/subjects", tags=["Subjects"])

@router.post("/", response_model=SubjectResponse)
def create_subject(
    subject_data: SubjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new subject (admin/manager only)"""
    # Check permission
    if current_user.org_role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    # Check for duplicate subject name in the same organization
    existing = db.query(Subject).filter(
        and_(
            Subject.organization_id == current_user.org_id,
            Subject.name == subject_data.name
        )
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Subject with this name already exists")
    
    # Create subject
    subject = Subject(
        name=subject_data.name,
        organization_id=current_user.org_id
    )
    
    db.add(subject)
    db.commit()
    db.refresh(subject)
    
    return subject
@router.get("/assignments", response_model=List[ClassSubjectResponse])
def get_all_assignments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    
    membership = (
    db.query(OrganizationMember)
    .filter(OrganizationMember.user_id == current_user.id)
    .first()
)
    if not membership:
        raise HTTPException(status_code=403, detail="User is not a member of any organization")
    assignments = (
        db.query(ClassSubject)
        .join(Classroom)
        .filter(Classroom.organization_id == membership.organization_id)
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

@router.get("/", response_model=List[SubjectResponse])
def get_subjects(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all subjects for the current organization"""
    subjects = db.query(Subject).filter(
        Subject.organization_id == current_user.org_id
    ).offset(skip).limit(limit).all()
    
    return subjects

@router.get("/{subject_id}", response_model=SubjectResponse)
def get_subject(
    subject_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific subject by ID"""
    subject = db.query(Subject).filter(
        and_(
            Subject.id == subject_id,
            Subject.organization_id == current_user.org_id
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
):
    """Update a subject (admin/manager only)"""
    if current_user.org_role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    subject = db.query(Subject).filter(
        and_(
            Subject.id == subject_id,
            Subject.organization_id == current_user.org_id
        )
    ).first()
    
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    
    # Check for duplicate name if name is being updated
    if subject_data.name and subject_data.name != subject.name:
        existing = db.query(Subject).filter(
            and_(
                Subject.organization_id == current_user.org_id,
                Subject.name == subject_data.name,
                Subject.id != subject_id
            )
        ).first()
        
        if existing:
            raise HTTPException(status_code=400, detail="Subject with this name already exists")
        
        subject.name = subject_data.name
    
    db.commit()
    db.refresh(subject)
    
    return subject

@router.delete("/{subject_id}")
def delete_subject(
    subject_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a subject (admin only)"""
    if current_user.org_role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete subjects")
    
    subject = db.query(Subject).filter(
        and_(
            Subject.id == subject_id,
            Subject.organization_id == current_user.org_id
        )
    ).first()
    
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    
    # Check if subject is being used in any class
    class_subjects = db.query(ClassSubject).filter(
        ClassSubject.subject_id == subject_id
    ).first()
    
    if class_subjects:
        raise HTTPException(
            status_code=400, 
            detail="Cannot delete subject that is assigned to classes. Remove from classes first."
        )
    
    db.delete(subject)
    db.commit()
    
    return {"message": "Subject deleted successfully"}

# ClassSubject endpoints (assign subjects to classes)
@router.post("/assign-to-class", response_model=ClassSubjectResponse)
def assign_subject_to_class(
    assignment: ClassSubjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Assign a subject to a class with optional teacher (admin/manager only)"""
    if current_user.org_role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    # Verify subject belongs to organization
    subject = db.query(Subject).filter(
        and_(
            Subject.id == assignment.subject_id,
            Subject.organization_id == current_user.org_id
        )
    ).first()
    
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found in your organization")
    
    # Verify classroom belongs to organization
    classroom = db.query(Classroom).filter(
        and_(
            Classroom.id == assignment.classroom_id,
            Classroom.organization_id == current_user.org_id
        )
    ).first()
    
    if not classroom:
        raise HTTPException(status_code=404, detail="Classroom not found in your organization")
    
    # Check if teacher exists (if provided)
    if assignment.teacher_member_id:
        teacher = db.query(OrganizationMember).filter(
            and_(
                OrganizationMember.id == assignment.teacher_member_id,
                OrganizationMember.organization_id == current_user.org_id,
                OrganizationMember.role == "teacher"
            )
        ).first()
        
        if not teacher:
            raise HTTPException(status_code=404, detail="Teacher not found")
    
    # Check for duplicate assignment
    existing = db.query(ClassSubject).filter(
        and_(
            ClassSubject.classroom_id == assignment.classroom_id,
            ClassSubject.subject_id == assignment.subject_id
        )
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Subject already assigned to this class")
    
    class_subject = ClassSubject(
        classroom_id=assignment.classroom_id,
        subject_id=assignment.subject_id,
        teacher_member_id=assignment.teacher_member_id
    )
    
    db.add(class_subject)
    db.commit()
    db.refresh(class_subject)
    
    return class_subject

