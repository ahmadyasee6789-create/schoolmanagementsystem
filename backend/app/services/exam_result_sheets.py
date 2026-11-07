"""Saved exam aggregation shared by read-only screens and exports, independent of PDF renderers."""
from collections import defaultdict
from fastapi import HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import joinedload
from app.models.classroom import Classroom, Grade
from app.models.exams import Exam, ExamPaper, ExamResult, GradeScale, Term
from app.models.student_enrollment import StudentEnrollment
from app.models.students import Student
from app.models.users import OrganizationMember
from app.services.exam_evaluation import evaluate_result

def enrollments(db, org_id, session_id, grade_name=None, classroom_id=None, student_id=None):
    query = db.query(StudentEnrollment).join(Student).outerjoin(Classroom).outerjoin(Grade).filter(
        Student.organization_id == org_id, StudentEnrollment.session_id == session_id,
        or_(Classroom.id.is_(None), and_(Classroom.organization_id == org_id,
            Classroom.academic_year_id == session_id, Grade.organization_id == org_id)),
    ).options(joinedload(StudentEnrollment.student), joinedload(StudentEnrollment.classroom).joinedload(Classroom.grade))
    if grade_name:
        query = query.filter(Grade.name == grade_name)
    if classroom_id:
        query = query.filter(Classroom.id == classroom_id)
    if student_id:
        query = query.filter(Student.id == student_id)
    return query.order_by(StudentEnrollment.id).all()


def identity(enrollment):
    student, classroom = enrollment.student, enrollment.classroom
    return dict(student_id=student.id, student_name=f"{student.first_name} {student.last_name or ''}".strip(),
                admission_no=student.admission_no, grade_name=classroom.grade.name if classroom else None,
                section=classroom.section if classroom else None, classroom_id=classroom.id if classroom else None, enrollment_id=enrollment.id)


def require_class_result_access(db, user, classroom_id, session_id):
    if user.org_role not in {'admin', 'manager', 'teacher'}:
        raise HTTPException(403, 'You cannot export examination results')
    classroom = db.query(Classroom).filter_by(id=classroom_id, organization_id=user.org_id, academic_year_id=session_id).first()
    if classroom is None:
        raise HTTPException(404, 'Classroom not found in this session')
    if user.org_role == 'teacher':
        membership = db.query(OrganizationMember).filter_by(user_id=user.id, organization_id=user.org_id, role='teacher').first()
        if membership is None or classroom.class_teacher_member_id != membership.id:
            raise HTTPException(403, 'Only the assigned class teacher can export this class marks sheet')


def scoped_exam(db, user, exam_id, session_id):
    exam = db.query(Exam).join(Term).filter(Exam.id == exam_id, Exam.organization_id == user.org_id,
        Term.organization_id == user.org_id, Term.academic_year_id == session_id).first()
    if exam is None:
        raise HTTPException(404, 'Exam not found in this session')
    return exam


def grade_for(percentage, scales):
    return next((s for s in scales if percentage is not None and s.min_percentage <= percentage <= s.max_percentage), None)


def saved_result_groups(db, org_id, session_id, exam_id=None, grade_name=None, classroom_id=None, student_id=None, result=None, active_only=False):
    enrolled = enrollments(db, org_id, session_id, grade_name, classroom_id, student_id)
    if active_only:
        # Match the existing class marks-entry roster. Do not silently omit an
        # active enrollment because the separate student flag has changed.
        enrolled = [e for e in enrolled if e.is_active]
    papers_query = db.query(ExamPaper).join(Exam).join(Term).join(Classroom, ExamPaper.classroom_id == Classroom.id).filter(
        Exam.organization_id == org_id, Term.organization_id == org_id, Term.academic_year_id == session_id,
        Classroom.organization_id == org_id, Classroom.academic_year_id == session_id,
    ).options(joinedload(ExamPaper.exam), joinedload(ExamPaper.subject))
    if exam_id:
        papers_query = papers_query.filter(Exam.id == exam_id)
    if classroom_id:
        papers_query = papers_query.filter(ExamPaper.classroom_id == classroom_id)
    grouped = defaultdict(list)
    papers = papers_query.order_by(ExamPaper.id).all()
    for paper in papers:
        if paper.subject is None or paper.subject.organization_id != org_id or paper.subject.session_id != session_id:
            raise HTTPException(409, 'Exam paper subject ownership is inconsistent')
        if not paper.total_marks or paper.total_marks < 0 or paper.pass_marks is None or not 0 <= paper.pass_marks <= paper.total_marks:
            raise HTTPException(409, 'An exam paper has invalid marks configuration')
        grouped[(paper.classroom_id, paper.exam_id)].append(paper)
    marks = {(r.student_enrollment_id, r.exam_paper_id): r.obtained_marks for r in db.query(ExamResult).filter(
        ExamResult.student_enrollment_id.in_([e.id for e in enrolled]), ExamResult.exam_paper_id.in_([p.id for p in papers]))}
    scales = db.query(GradeScale).filter_by(organization_id=org_id).order_by(GradeScale.min_percentage.desc()).all()
    rows = []
    for enrollment in enrolled:
        for (class_id, _), exam_papers in grouped.items():
            if class_id != enrollment.classroom_id:
                continue
            subjects = []
            for paper in exam_papers:
                obtained = marks.get((enrollment.id, paper.id))
                if obtained is not None and not 0 <= obtained <= paper.total_marks:
                    raise HTTPException(409, 'Saved marks are outside the exam paper limits')
                pct = round(obtained / paper.total_marks * 100, 2) if obtained is not None else None
                scale = grade_for(pct, scales)
                subjects.append(dict(key=f'{paper.subject_id}:{paper.total_marks}', paper_id=paper.id, subject_id=paper.subject_id,
                    subject_name=paper.subject.name, obtained_marks=obtained, total_marks=paper.total_marks, pass_marks=paper.pass_marks,
                    grade=scale.grade if scale else None, gpa=scale.gpa if scale else None))
            # evaluate_result is the sole authority for the pass/fail rule.
            evaluation = evaluate_result([dict(total=s['total_marks'], obtained=s['obtained_marks'], **{'pass': s['pass_marks']}) for s in subjects])
            if result and evaluation['result'] != {'pass': 'PASSED', 'fail': 'FAILED', 'incomplete': 'INCOMPLETE'}.get(result, result):
                continue
            scale = grade_for(evaluation['percentage'], scales)
            rows.append(dict(**identity(enrollment), roll_number=enrollment.roll_number,
                exam_id=exam_papers[0].exam_id, exam_name=exam_papers[0].exam.name, subjects=subjects,
                obtained_total=sum(s['obtained_marks'] or 0 for s in subjects), possible_total=sum(s['total_marks'] for s in subjects),
                **evaluation, missing_count=sum(s['obtained_marks'] is None for s in subjects),
                grade=scale.grade if scale else None, gpa=scale.gpa if scale else None))
    return sorted(rows, key=lambda r: (r['classroom_id'], int(r['roll_number']) if str(r['roll_number'] or '').isdigit() else 999999, r['student_name'], r['student_id']))


def result_sheet(rows, exam, session):
    columns = {}
    for row in rows:
        for subject in row['subjects']:
            columns.setdefault(subject['key'], {k: subject[k] for k in ('key', 'subject_name', 'total_marks')})
    return dict(exam_id=exam.id, exam_name=exam.name, session_id=session.id, session_name=session.name,
                columns=list(columns.values()), items=rows)


