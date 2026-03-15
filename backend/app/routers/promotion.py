from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, Integer

from app.db.session import get_db
from app.routers.auth import get_current_user
from app.dependencies import get_active_session

from app.models.student_enrollment import StudentEnrollment
from app.models.exams import Exam, ExamPaper, ExamResult
from app.models.classroom import Classroom, Grade

router = APIRouter(
    prefix="/promotion",
    tags=["Promotion"]
)

# -----------------------------------------------------------
# PREVIEW PROMOTION
# -----------------------------------------------------------

from app.models.students import Student  # add this import

@router.get("/preview/{classroom_id}")
def preview_promotion(
    classroom_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    active_session=Depends(get_active_session)
):
    classroom = db.query(Classroom).filter(
        Classroom.id == classroom_id,
        Classroom.organization_id == current_user.org_id
    ).first()

    if not classroom:
        raise HTTPException(404, "Classroom not found")

    enrollments = db.query(StudentEnrollment).filter(
        StudentEnrollment.classroom_id == classroom_id,
        StudentEnrollment.session_id == active_session.id,
        StudentEnrollment.is_active == True
    ).all()

    if not enrollments:
        raise HTTPException(404, "No students found")

    passed_students = []
    failed_students = []
    no_result_students = []

    for enrollment in enrollments:
        student = db.query(Student).filter(Student.id == enrollment.student_id).first()
        student_info = {
            "student_id": enrollment.student_id,
            "name": f"{student.first_name} {student.last_name}" if student else "Unknown",
            "admission_no": student.admission_no if student else "",
        }

        # Check if any results exist at all
        has_results = db.query(ExamResult).join(
            ExamPaper, ExamResult.exam_paper_id == ExamPaper.id
        ).filter(
            ExamResult.student_enrollment_id == enrollment.id,
            ExamPaper.classroom_id == classroom_id
        ).first()

        if not has_results:
            no_result_students.append(student_info)
            continue

        passed = db.query(
            func.min(
                (ExamResult.obtained_marks >= ExamPaper.pass_marks).cast(Integer)
            )
        ).join(
            ExamPaper, ExamResult.exam_paper_id == ExamPaper.id
        ).filter(
            ExamResult.student_enrollment_id == enrollment.id,
            ExamPaper.classroom_id == classroom_id
        ).scalar()

        if passed:
            passed_students.append(student_info)
        else:
            failed_students.append(student_info)

    return {
        "classroom_id": classroom_id,
        "total_students": len(enrollments),
        "passed_students": passed_students,
        "failed_students": failed_students,
        "no_result_students": no_result_students,
    }

# -----------------------------------------------------------
# PROMOTE STUDENTS
# -----------------------------------------------------------

@router.post("/class/{classroom_id}")
def promote_students(
    classroom_id: int,
    next_session_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    active_session=Depends(get_active_session)
):

    # 1️⃣ Check classroom
    classroom = db.query(Classroom).filter(
        Classroom.id == classroom_id,
        Classroom.organization_id == current_user.org_id
    ).first()

    if not classroom:
        raise HTTPException(404, "Classroom not found")

    # 2️⃣ Get current grade
    current_grade = db.query(Grade).filter(
        Grade.id == classroom.grade_id
    ).first()

    # 3️⃣ Detect next grade using display_order
    next_grade = db.query(Grade).filter(
        Grade.organization_id == current_user.org_id,
        Grade.display_order == current_grade.display_order + 1
    ).first()

    if not next_grade:
        raise HTTPException(
            400,
            "No next grade found. Students may already be in the final grade."
        )

    # 4️⃣ Find next classroom (same section)
    next_classroom = db.query(Classroom).filter(
        Classroom.grade_id == next_grade.id,
        Classroom.section == classroom.section,
        Classroom.organization_id == current_user.org_id
    ).first()

    if not next_classroom:
        raise HTTPException(
            400,
            "Next classroom not found. Please create next grade section first."
        )

    # 5️⃣ Get students in current class
    enrollments = db.query(StudentEnrollment).filter(
        StudentEnrollment.classroom_id == classroom_id,
        StudentEnrollment.session_id == active_session.id,
        StudentEnrollment.is_active == True
    ).order_by(StudentEnrollment.roll_number.asc()).all()

    if not enrollments:
        raise HTTPException(404, "No students found")

    promoted = 0
    failed = 0
    last_roll = (
    db.query(func.max(StudentEnrollment.roll_number))
    .filter(
        StudentEnrollment.classroom_id == next_classroom.id,
        StudentEnrollment.session_id == next_session_id
    )
    .scalar()
)

    next_roll = (last_roll or 0) + 1

    for enrollment in enrollments:

        # 6️⃣ Check pass / fail
        passed = db.query(
            func.min(
                (ExamResult.obtained_marks >= ExamPaper.pass_marks).cast(Integer)
            )
        ).join(
            ExamPaper,
            ExamResult.exam_paper_id == ExamPaper.id
        ).filter(
            ExamResult.student_enrollment_id == enrollment.id,
            ExamPaper.classroom_id == classroom_id
        ).scalar()

        if passed:

            # 7️⃣ Create new enrollment
            new_enrollment = StudentEnrollment(
                student_id=enrollment.student_id,
                classroom_id=next_classroom.id,
                session_id=next_session_id,
                roll_number=next_roll,
                is_active=True
            )

            db.add(new_enrollment)

            # deactivate old enrollment
            enrollment.is_active = False

            promoted += 1

        else:
            failed += 1

    db.commit()

    return {
        "message": "Promotion completed successfully",
        "from_classroom": classroom_id,
        "to_classroom": next_classroom.id,
        "promoted_students": promoted,
        "failed_students": failed,
        "total_students": len(enrollments)
    }