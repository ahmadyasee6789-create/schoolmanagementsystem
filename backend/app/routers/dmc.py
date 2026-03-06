"""
app/routers/dmc.py
------------------
Bulk DMC generation — one PDF per class, one page per student.
GET /dmc/exam/{exam_id}/class/{classroom_id}
"""

import io
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.routers.auth import get_current_user
from app.models import (
    Exam, ExamPaper, ExamResult, StudentEnrollment,
    Student, Classroom, OrganizationMember
)
from app.models.exams import GradeScale
from app.services.dmc_generator import generate_bulk_dmc   

router = APIRouter(prefix="/dmc", tags=["DMC"])


@router.get("/exam/{exam_id}/class/{classroom_id}")
def bulk_dmc(
    exam_id: int,
    classroom_id: int,
    db: Session = Depends(get_db),
    current_user: OrganizationMember = Depends(get_current_user),
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
    enrollments = db.query(StudentEnrollment).filter(
        StudentEnrollment.classroom_id == classroom_id,
        StudentEnrollment.is_active == True,
    ).all()
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
    enrollments.sort(key=lambda e: (e.roll_number or 999))

    students_data = []
    for enrollment in enrollments:
        student = db.query(Student).filter(Student.id == enrollment.student_id).first()
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

            obtained = result.obtained_marks if result else 0
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
        for gs in grade_scales:
            if gs.min_percentage <= percentage <= gs.max_percentage:
                grade = gs.grade
                break

        passed = all(
            s["obtained"] >= s["pass"] for s in subjects if s["total"] > 0
        )

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
        })

    if not students_data:
        raise HTTPException(404, "No student data found")

    # ── 7. Compute positions (rank by obtained_total desc) ────────────
    ranked = sorted(students_data, key=lambda x: x["obtained_total"], reverse=True)
    positions = {}
    for rank, s in enumerate(ranked, 1):
        positions[s["roll_no"]] = rank

    for s in students_data:
        s["position"] = f"{positions[s['roll_no']]}{'st' if positions[s['roll_no']] == 1 else 'nd' if positions[s['roll_no']] == 2 else 'rd' if positions[s['roll_no']] == 3 else 'th'}"

    # ── 8. Generate PDF ───────────────────────────────────────────────
    meta = {
        "school_name": "UJALA MODEL SCHOOL JEHANGIRA",   # TODO: pull from org settings
        "exam_name":   exam.name,
        "class_label": class_label,
    }

    buf = io.BytesIO()
    generate_bulk_dmc(buf, meta, students_data)
    buf.seek(0)

    filename = f"DMC_{exam.name}_{class_label}.pdf".replace(" ", "_").replace("–", "-")
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"},
    )