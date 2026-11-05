from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, Integer

from app.db.session import get_db
from app.routers.auth import get_current_user
from app.dependencies import get_active_session
from app.services.exam_evaluation import evaluate_result
from app.models.student_enrollment import StudentEnrollment
from app.models.exams import Exam, ExamPaper, ExamResult, Term
from app.models.classroom import Classroom, Grade

router = APIRouter(
    prefix="/promotion",
    tags=["Promotion"]
)

# -----------------------------------------------------------
# PREVIEW PROMOTION
# -----------------------------------------------------------

from app.models.students import Student  # add this import
def validate_promotion_exam(
    db: Session,
    exam_id: int,
    org_id: int,
    session_id: int,
):
    exam = (
        db.query(Exam)
        .join(Term, Exam.term_id == Term.id)
        .filter(
            Exam.id == exam_id,
            Exam.organization_id == org_id,
            Term.academic_year_id == session_id,
        )
        .first()
    )

    if exam is None:
        raise HTTPException(
            status_code=404,
            detail="Exam not found in the active session",
        )

    return exam
def get_student_evaluation(
    db: Session,
    enrollment: StudentEnrollment,
    exam_id: int,
):
    papers = (
        db.query(ExamPaper)
        .filter(
            ExamPaper.exam_id == exam_id,
            ExamPaper.classroom_id == enrollment.classroom_id,
        )
        .all()
    )

    if not papers:
        return None

    subjects = []

    for paper in papers:
        result = (
            db.query(ExamResult)
            .filter(
                ExamResult.exam_paper_id == paper.id,
                ExamResult.student_enrollment_id == enrollment.id,
            )
            .first()
        )

        # Missing marks: not eligible for promotion
        if result is None or result.obtained_marks is None:
            return None

        subjects.append({
            "name": str(paper.id),
            "total": paper.total_marks,
            "obtained": result.obtained_marks,
            "pass": paper.pass_marks,
        })

    return evaluate_result(subjects)
@router.get("/preview/{classroom_id}")
def preview_promotion(
    classroom_id: int,
    exam_id:int,
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
    validate_promotion_exam(
    db=db,
    exam_id=exam_id,
    org_id=current_user.org_id,
    session_id=active_session.id,
)

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
       

       

        evaluation = get_student_evaluation(db, enrollment, exam_id)

        if  evaluation is None:
            no_result_students.append(student_info)
            continue

        student_info["percentage"] = evaluation["percentage"]
        student_info["failed_count"] = evaluation["failed_count"]
        student_info["result"] = evaluation["result"]

        if evaluation["result"] == "PASSED":
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
    exam_id: int,
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
    validate_promotion_exam(
    db=db,
    exam_id=exam_id,
    org_id=current_user.org_id,
    session_id=active_session.id,
)

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
        evaluation = get_student_evaluation(db, enrollment, exam_id)
        if evaluation is None:
            failed += 1
            continue
        passed = evaluation["result"] == "PASSED"

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
            next_roll += 1
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
