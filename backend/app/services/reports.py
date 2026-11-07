"""Read-only academic reporting facade. Financial reports never reprice obligations."""
from fastapi import HTTPException
from app.services.exam_result_sheets import enrollments, identity, saved_result_groups


def academic_access(user):
    if user.org_role not in {"admin", "manager"}:
        raise HTTPException(403, "Schoolwide academic reports require an administrator or manager")


def exam_rows(db, user, session_id, exam_id=None, grade_name=None, classroom_id=None, student_id=None, result=None):
    academic_access(user)
    groups = saved_result_groups(db, user.org_id, session_id, exam_id, grade_name, classroom_id, student_id, result)
    return [dict(**{k: v for k, v in row.items() if k not in {'subjects', 'grade', 'gpa', 'result', 'percentage'}},
                 subject_name=subject['subject_name'], obtained_marks=subject['obtained_marks'],
                 total_marks=subject['total_marks'], pass_marks=subject['pass_marks'], grade=subject['grade'], gpa=subject['gpa'],
                 overall_result=row['result'], overall_percentage=row['percentage'])
            for row in groups for subject in row['subjects']]
