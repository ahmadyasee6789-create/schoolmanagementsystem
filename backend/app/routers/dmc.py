import io
from fastapi import APIRouter, Depends, HTTPException,Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.models import Organization
from app.db.session import get_db
from app.routers.auth import get_current_user
from app.models import (
    Exam, ExamPaper, ExamResult, StudentEnrollment,
    Student, Classroom, OrganizationMember
)
from app.services.exam_evaluation import evaluate_result
from app.models.exams import GradeScale
from app.services.dmc_generator import generate_bulk_dmc  
from app.services.dmc_generator_three import  generate_bulk_dmc_three
from app.dependencies import get_active_session 
from app.services.school_logo import organization_logo  
router = APIRouter(prefix="/dmc", tags=["DMC"])


@router.get("/exam/{exam_id}/class/{classroom_id}")
def bulk_dmc(
    exam_id: int,
    classroom_id: int,
    layout: int = Query(2, ge=2, le=3),
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user),
    active_session=Depends(get_active_session)
):
    # ── 1. Validate exam belongs to org ──────────────────────────────
    exam = db.query(Exam).filter(
        Exam.id == exam_id,
        Exam.organization_id == current_user.org_id,
    ).first()
    if not exam:
        raise HTTPException(404, "Exam not found")

    # ── 2. Get all exam papers for this exam + classroom ─────────────
    papers = db.query(ExamPaper).filter(
        ExamPaper.exam_id == exam_id,
        ExamPaper.classroom_id == classroom_id,
    ).all()
    if not papers:
        raise HTTPException(404, "No exam papers found for this class")

    paper_ids = [p.id for p in papers]

    # ── 3. Get all active enrollments for this classroom ─────────────
    enrollments = (
    db.query(StudentEnrollment)
    .join(Student)
    .filter(
        StudentEnrollment.classroom_id == classroom_id,
        StudentEnrollment.session_id == active_session.id,
        StudentEnrollment.is_active == True,   # active in this classroom/session
        Student.is_active == True              # globally active
    )
    .order_by(StudentEnrollment.roll_number)
    .all()
)
    if not enrollments:
        raise HTTPException(404, "No students enrolled in this class")

    # ── 4. Get grade scales ───────────────────────────────────────────
    grade_scales = db.query(GradeScale).filter(
        GradeScale.organization_id == current_user.org_id
    ).order_by(GradeScale.min_percentage.desc()).all()

    # ── 5. Get classroom info ─────────────────────────────────────────
    classroom = db.query(Classroom).filter(Classroom.id == classroom_id).first()
    class_label = f"{classroom.grade.name} – {classroom.section}" if classroom else f"Class #{classroom_id}"

    # ── 6. Build per-student data ─────────────────────────────────────
    # Sort enrollments by roll_number
    enrollments.sort(key=lambda e: int(e.roll_number) if e.roll_number and str(e.roll_number).isdigit() else 999)

    students_data = []
    for enrollment in enrollments:
        student = db.query(Student).filter(
            Student.id == enrollment.student_id,
            Student.organization_id == current_user.org_id
            ).first()
        if not student:
            continue

        subjects = []
        grand_total = 0
        obtained_total = 0

        for paper in papers:
            result = db.query(ExamResult).filter(
                ExamResult.exam_paper_id == paper.id,
                ExamResult.student_enrollment_id == enrollment.id,
            ).first()

            if result is None or result.obtained_marks is None:
               raise HTTPException(
        status_code=409,
        detail=(
            f"Marks missing for {student.first_name} "
            f"in {paper.subject.name}. Enter marks before generating DMC."
        )
    )

            obtained = result.obtained_marks
            subjects.append({
                "name":     paper.subject.name,
                "total":    paper.total_marks,
                "obtained": obtained,
                "pass":     paper.pass_marks,
            })
            grand_total    += paper.total_marks
            obtained_total += obtained

        # Calculate grade
        percentage = (obtained_total / grand_total * 100) if grand_total else 0
        grade = "—"
        
        evaluation = evaluate_result(subjects)
        passed = evaluation["result"] == "PASSED"
        percentage = evaluation["percentage"]
        failed_count = evaluation["failed_count"]
        for gs in grade_scales:
                    if gs.min_percentage <= percentage <= g+s.max_percentage:
                        grade = gs.grade
                        break
        students_data.append({
            "roll_no":      str(enrollment.roll_number or "—"),
            "student_name": f"{student.first_name} {student.last_name}".strip(),
            "father_name":  student.father_name or "—",
            "subjects":     subjects,
            "grand_total":  grand_total,
            "obtained_total": obtained_total,
            "percentage":   f"{percentage:.2f}%",
            "grade":        grade,
            "result":       "PASSED" if passed else "FAILED",
            "failed_count": evaluation["failed_count"],
        })

    if not students_data:
        raise HTTPException(404, "No student data found")

    
    # ── 7. Compute student positions ──────────────────────
    # Students with equal marks receive the same rank.
    ranked = sorted(
        students_data,
        key=lambda s: s["obtained_total"],
        reverse=True
    )

    previous_marks = None
    previous_rank = 0

    for index, student in enumerate(ranked, start=1):
        marks = student["obtained_total"]

        if marks != previous_marks:
            previous_rank = index

        student["position"] = previous_rank
        previous_marks = marks

    # ── 8. Fetch school information ───────────────────────
    org = db.query(Organization).filter(
        Organization.id == current_user.org_id
    ).first()

    if not org:
        raise HTTPException(
            status_code=404,
            detail="School organization not found"
        )

    # ── 9. Prepare DMC metadata ───────────────────────────
    meta = {
        "school_name": org.name,
        "exam_name": exam.name,
        "class_label": class_label,
        "logo_image": organization_logo(org),
    }

    # ── 10. Generate PDF ──────────────────────────────────
    buf = io.BytesIO()
    if layout == 3:
        generate_bulk_dmc_three(
          buf,
          meta,
          students_data
    )
    else:
        generate_bulk_dmc(
          buf,
          meta,
          students_data
    )

    buf.seek(0)

    # ── 11. Return printable PDF ──────────────────────────
    filename = (
        f"DMC_{exam.name}_{class_label}.pdf"
        .replace(" ", "_")
        .replace("–", "-")
    )

    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'inline; filename="{filename}"'
            )
        },
    )
