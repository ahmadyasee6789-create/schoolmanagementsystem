# app/routers/exam_papers.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.models.users import OrganizationMember
from app.models.exams import Exam, ExamPaper
from app.models.classroom import Classroom
from app.models.exams import Subject, ClassSubject,Term
from app.routers.auth import get_current_user
from app.schemas.exam_paper import ExamPaperCreate, ExamPaperUpdate, ExamPaperOut
from app.dependencies import get_active_session

router = APIRouter(prefix="/exam-papers", tags=["Exam Papers"])

# -------------------------
# GET all exam papers for org
# -------------------------
@router.get("/", response_model=List[ExamPaperOut])
def get_exam_papers(
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user),
    active_session=Depends(get_active_session)
):
    papers = (
        db.query(ExamPaper)
        .join(Exam)
        .join(Classroom)
        .join(Subject)
        .join(Term)
        .filter(Exam.organization_id == current_user.org_id,
                Term.academic_year_id==active_session.id)
        .all()
    )

    result = []
    for p in papers:
        result.append(
            ExamPaperOut(
                id=p.id,
                exam_id=p.exam_id,
                classroom_id=p.classroom_id,
                subject_id=p.subject_id,
                total_marks=p.total_marks,
                pass_marks=p.pass_marks,
                exam_name=p.exam.name,
                classroom_name=f"{p.classroom.grade.name} {p.classroom.section}",
                subject_name=p.subject.name,
            )
        )

    return result

# -------------------------
# GET exam paper by ID
# -------------------------
@router.get("/{paper_id}", response_model=ExamPaperOut)
def get_exam_paper(
    paper_id: int,
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user)
):
    paper = db.query(ExamPaper).join(Exam).filter(
        ExamPaper.id == paper_id,
        Exam.organization_id == current_user.org_id
    ).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Exam paper not found")
    return paper

# -------------------------
# CREATE exam paper
# -------------------------
@router.post("/", response_model=ExamPaperOut, status_code=status.HTTP_201_CREATED)
def create_exam_paper(
    paper_in: ExamPaperCreate,
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user),
    active_session=Depends(get_active_session)
):
    # Check if exam exists and belongs to org
    exam = (
        db.query(Exam).join(Term)
        .filter(
        Exam.id == paper_in.exam_id,
        Exam.organization_id == current_user.org_id,
        Term.academic_year_id==active_session.id
    ).first())
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    # Check if classroom exists and belongs to org
    classroom = db.query(Classroom).filter(
        Classroom.id == paper_in.classroom_id,
        Classroom.organization_id == current_user.org_id
    ).first()
    if not classroom:
        raise HTTPException(status_code=404, detail="Classroom not found")

    # Check if subject exists
    subject = db.query(Subject).filter(
        Subject.id == paper_in.subject_id,
        Subject.organization_id == current_user.org_id
    ).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    class_subject = db.query(ClassSubject).filter(
        ClassSubject.classroom_id == paper_in.classroom_id,
        ClassSubject.subject_id == paper_in.subject_id
    ).first()

    if not class_subject:
        raise HTTPException(
            status_code=400,
            detail="Subject is not assigned to this classroom"
        )

    # Prevent duplicate exam paper for same exam+classroom+subject
    existing = db.query(ExamPaper).filter(
        ExamPaper.exam_id == paper_in.exam_id,
        ExamPaper.classroom_id == paper_in.classroom_id,
        ExamPaper.subject_id == paper_in.subject_id
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Exam paper already exists for this exam, class, and subject"
        )

    paper = ExamPaper(
        exam_id=paper_in.exam_id,
        classroom_id=paper_in.classroom_id,
        subject_id=paper_in.subject_id,
        total_marks=paper_in.total_marks,
        pass_marks=paper_in.pass_marks
    )
    db.add(paper)
    db.commit()
    db.refresh(paper)
    return {
    "id": paper.id,
    "exam_id": paper.exam_id,
    "classroom_id": paper.classroom_id,
    "subject_id": paper.subject_id,
    "total_marks": paper.total_marks,
    "pass_marks": paper.pass_marks,
    "exam_name": exam.name,
    "classroom_name": f"{classroom.grade.name} {classroom.section}",
    "subject_name": subject.name
}

# -------------------------
# UPDATE exam paper
# -------------------------
@router.put("/{paper_id}", response_model=ExamPaperOut)
def update_exam_paper(
    paper_id: int,
    paper_in: ExamPaperUpdate,
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user)
):
    paper = db.query(ExamPaper).join(Exam).filter(
        ExamPaper.id == paper_id,
        Exam.organization_id == current_user.org_id
    ).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Exam paper not found")

    if paper_in.total_marks is not None:
        paper.total_marks = paper_in.total_marks
    if paper_in.pass_marks is not None:
        paper.pass_marks = paper_in.pass_marks

    db.commit()
    db.refresh(paper)
    return paper

# -------------------------
# DELETE exam paper
# -------------------------
@router.delete("/{paper_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exam_paper(
    paper_id: int,
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user)
):
    paper = db.query(ExamPaper).join(Exam).filter(
        ExamPaper.id == paper_id,
        Exam.organization_id == current_user.org_id
    ).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Exam paper not found")

    # Prevent deletion if there are results linked
    if paper.results:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete exam paper with existing results"
        )

    db.delete(paper)
    db.commit()
    return None