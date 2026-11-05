"""Query-budget regressions using synthetic fixtures in an in-memory database."""
from contextlib import contextmanager
from datetime import date
from types import SimpleNamespace
import unittest

from fastapi import HTTPException
from sqlalchemy import event

import test_fee_integrity as fixture
from app.models.classroom import Classroom
from app.models.exams import Exam, ExamPaper, Subject, Term
from app.models.users import OrganizationMember, User
from app.routers.classes import get_classes
from app.routers.exam_papers import get_exam_papers
from app.routers.exams import get_exams


class ExamListQueryTests(unittest.TestCase):
    def setUp(self):
        fixture.FeeIntegrityTests.setUp(self)
        self.active_session = SimpleNamespace(id=1)

    @contextmanager
    def queries(self, expected):
        statements = []

        def record(_conn, _cursor, statement, _params, _context, _many):
            statements.append(statement)

        self.db.expunge_all()
        event.listen(self.engine, "before_cursor_execute", record)
        try:
            yield
        finally:
            event.remove(self.engine, "before_cursor_execute", record)
        self.assertEqual(len(statements), expected)

    def test_papers_load_exam_class_grade_and_subject_in_one_query(self):
        self.db.add(Term(id=1, name="Term 1", academic_year_id=1, organization_id=1))
        self.db.flush()
        self.db.add(Exam(id=1, name="Final", term_id=1, organization_id=1,
                         start_date=date(2026, 5, 1), end_date=date(2026, 5, 10)))
        self.db.add_all(Subject(id=i, name=f"Subject {i}", session_id=1, organization_id=1) for i in range(1, 5))
        self.db.flush()
        self.db.add_all(ExamPaper(exam_id=1, classroom_id=1, subject_id=i, total_marks=100, pass_marks=40) for i in range(1, 5))
        self.db.commit()
        with self.queries(1):
            papers = get_exam_papers(self.db, self.actor, self.active_session)
        self.assertEqual(len(papers), 4)
        self.assertEqual({paper.exam_name for paper in papers}, {"Final"})
        self.assertEqual({paper.classroom_name for paper in papers}, {"Test Grade A"})
        self.assertEqual({paper.subject_name for paper in papers}, {f"Subject {i}" for i in range(1, 5)})
        with self.queries(1):
            exams = get_exams(self.db, self.actor, self.active_session)
        self.assertEqual([exam.name for exam in exams], ["Final"])

    def test_classes_load_teacher_names_in_one_query(self):
        self.db.add_all(User(id=i, full_name=f"Teacher {i}", email=f"teacher{i}@example.invalid") for i in (2, 3))
        self.db.flush()
        self.db.add_all(OrganizationMember(id=i, user_id=i, organization_id=1, role="teacher") for i in (2, 3))
        self.db.flush()
        self.db.get(Classroom, 1).class_teacher_member_id = 2
        self.db.add(Classroom(id=2, grade_id=1, section="B", organization_id=1, academic_year_id=1, class_teacher_member_id=3))
        self.db.add(Classroom(id=3, grade_id=1, section="C", organization_id=1, academic_year_id=1))
        self.db.commit()
        with self.queries(1):
            rows = {row["id"]: row for row in get_classes(self.db, self.actor)}
        self.assertEqual({i: (row["teacher_id"], row["teacher_name"]) for i, row in rows.items()},
                         {1: (2, "Teacher 2"), 2: (3, "Teacher 3"), 3: (None, None)})

    def test_classes_refuses_auth_without_an_organization(self):
        with self.queries(0), self.assertRaises(HTTPException) as raised:
            get_classes(self.db, SimpleNamespace(id=1, org_id=None))
        self.assertEqual(raised.exception.status_code, 403)
