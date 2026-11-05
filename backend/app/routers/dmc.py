import io

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session, contains_eager, joinedload, undefer

from app.db.session import get_db
from app.dependencies import get_active_session
from app.models import (
    Classroom, Exam, ExamPaper, ExamResult, Organization, OrganizationMember,
    Student, StudentEnrollment,
)
from app.models.exams import GradeScale, Term
from app.routers.auth import get_current_user
from app.services.dmc_generator import generate_bulk_dmc
from app.services.dmc_generator_three import generate_bulk_dmc_three
from app.services.exam_evaluation import evaluate_result
from app.services.school_logo import organization_logo

router = APIRouter(prefix="/dmc", tags=["DMC"])


@router.get("/exam/{exam_id}/class/{classroom_id}")
def bulk_dmc(
    exam_id: int,
    classroom_id: int,
    layout: int = Query(2, ge=2, le=3),
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user),
    active_session=Depends(get_active_session),
):
    org_id = current_user.org_id
    session_id = active_session.id
    exam = db.query(Exam).join(Exam.term).filter(
        Exam.id == exam_id,
        Exam.organization_id == org_id,
        Term.academic_year_id == session_id,
    ).first()
    if exam is None:
        raise HTTPException(404, "Exam not found")

    papers = (
        db.query(ExamPaper)
        .join(ExamPaper.classroom)
        .options(
            joinedload(ExamPaper.subject),
            contains_eager(ExamPaper.classroom).joinedload(Classroom.grade),
        )
        .filter(
            ExamPaper.exam_id == exam_id,
            ExamPaper.classroom_id == classroom_id,
            Classroom.organization_id == org_id,
            Classroom.academic_year_id == session_id,
        )
        .order_by(ExamPaper.id)
        .all()
    )
    if not papers:
        raise HTTPException(404, "No exam papers found for this class")

    enrollments = (
        db.query(StudentEnrollment)
        .join(StudentEnrollment.student)
        .options(contains_eager(StudentEnrollment.student))
        .filter(
            StudentEnrollment.classroom_id == classroom_id,
            StudentEnrollment.session_id == session_id,
            StudentEnrollment.is_active.is_(True),
            Student.organization_id == org_id,
            Student.is_active.is_(True),
        )
        .order_by(StudentEnrollment.roll_number)
        .all()
    )
    if not enrollments:
        raise HTTPException(404, "No students enrolled in this class")

    # Fetch the class's marks in one query instead of querying per student and paper.
    marks = {
        (enrollment_id, paper_id): obtained
        for enrollment_id, paper_id, obtained in db.query(
            ExamResult.student_enrollment_id, ExamResult.exam_paper_id, ExamResult.obtained_marks,
        ).filter(
            ExamResult.student_enrollment_id.in_([enrollment.id for enrollment in enrollments]),
            ExamResult.exam_paper_id.in_([paper.id for paper in papers]),
        )
    }
    grade_scales = db.query(GradeScale).filter(
        GradeScale.organization_id == org_id,
    ).order_by(GradeScale.min_percentage.desc()).all()

    enrollments.sort(key=lambda e: int(e.roll_number) if e.roll_number and str(e.roll_number).isdigit() else 999)
    students_data = []
    for enrollment in enrollments:
        student = enrollment.student
        subjects = []
        for paper in papers:
            obtained = marks.get((enrollment.id, paper.id))
            if obtained is None:
                raise HTTPException(409, f"Marks missing for {student.first_name} in {paper.subject.name}. Enter marks before generating DMC.")
            subjects.append({
                "name": paper.subject.name,
                "total": paper.total_marks,
                "obtained": obtained,
                "pass": paper.pass_marks,
            })
        evaluation = evaluate_result(subjects)
        percentage = evaluation["percentage"]
        grade = next((scale.grade for scale in grade_scales
                      if scale.min_percentage <= percentage <= scale.max_percentage), "—")
        students_data.append({
            "roll_no": str(enrollment.roll_number or "—"),
            "student_name": f"{student.first_name} {student.last_name or ''}".strip(),
            "father_name": student.father_name or "—",
            "subjects": subjects,
            "grand_total": sum(subject["total"] for subject in subjects),
            "obtained_total": sum(subject["obtained"] for subject in subjects),
            "percentage": f"{percentage:.2f}%",
            "grade": grade,
            "result": evaluation["result"],
            "failed_count": evaluation["failed_count"],
        })

    ranked = sorted(students_data, key=lambda student: student["obtained_total"], reverse=True)
    previous_marks = None
    previous_rank = 0
    for index, student in enumerate(ranked, start=1):
        if student["obtained_total"] != previous_marks:
            previous_rank = index
        student["position"] = previous_rank
        previous_marks = student["obtained_total"]

    org = db.query(Organization).options(undefer(Organization.logo)).filter(
        Organization.id == org_id,
    ).first()
    if org is None:
        raise HTTPException(404, "School organization not found")

    classroom = papers[0].classroom
    class_label = f"{classroom.grade.name} – {classroom.section}"
    meta = {
        "school_name": org.name,
        "exam_name": exam.name,
        "session_name": active_session.name,
        "class_label": class_label,
        "logo_image": organization_logo(org),
    }
    buf = io.BytesIO()
    render = generate_bulk_dmc_three if layout == 3 else generate_bulk_dmc
    render(buf, meta, students_data)
    filename = f"DMC_{exam.name}_{class_label}.pdf".replace(" ", "_").replace("–", "-")
    return Response(
        buf.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
