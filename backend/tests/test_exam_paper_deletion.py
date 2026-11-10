"""Safe exam-paper deletion against synthetic SQLite or disposable PostgreSQL data."""
from datetime import date
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

import test_exam_result_entry as fixture
from app.models.academic_session import AcademicSession
from app.models.classroom import Classroom, Grade
from app.models.exams import Exam, ExamPaper, ExamResult, Subject, Term
from app.models.student_enrollment import StudentEnrollment
from app.models.students import Student
from app.routers import exam_papers


class ExamPaperDeletionTests(unittest.TestCase):
    def setUp(self):
        fixture.ExamResultEntryTests.setUp(self)
        self.actor.org_role = "admin"
        self.active = SimpleNamespace(id=1)

        self.db.add_all([
            Student(id=5, organization_id=1, first_name="Other class", admission_no="TEST-005"),
            Classroom(id=2, organization_id=1, grade_id=1, section="B", academic_year_id=1),
            AcademicSession(id=3, organization_id=1, name="2025-26", is_active=False,
                            start_date=date(2025, 4, 1), end_date=date(2026, 3, 31)),
            Student(id=7, organization_id=1, first_name="Historical", admission_no="TEST-007"),
            Classroom(id=4, organization_id=1, grade_id=1, section="C", academic_year_id=3),
            Subject(id=6, organization_id=1, session_id=3, name="Historical subject"),
            Term(id=3, organization_id=1, academic_year_id=3, name="Historical term"),
            Exam(id=3, organization_id=1, term_id=3, name="Historical exam",
                 start_date=date(2026, 2, 1), end_date=date(2026, 2, 8)),
            Grade(id=2, organization_id=2, name="Other grade"),
            Student(id=6, organization_id=2, first_name="Other school", admission_no="OTHER-006"),
            Classroom(id=3, organization_id=2, grade_id=2, section="A", academic_year_id=2),
            Subject(id=5, organization_id=2, session_id=2, name="Other subject"),
            Term(id=2, organization_id=2, academic_year_id=2, name="Other term"),
            Exam(id=2, organization_id=2, term_id=2, name="Other exam",
                 start_date=date(2026, 10, 1), end_date=date(2026, 10, 8)),
        ])
        self.db.flush()
        self.db.add_all([
            StudentEnrollment(student_id=5, session_id=1, classroom_id=2),
            StudentEnrollment(student_id=7, session_id=3, classroom_id=4),
            StudentEnrollment(student_id=6, session_id=2, classroom_id=3),
        ])
        self.db.flush()
        enrollments = {row.student_id: row.id for row in self.db.query(StudentEnrollment).all()}
        self.db.add_all([
            ExamPaper(id=5, exam_id=1, classroom_id=2, subject_id=2, total_marks=100, pass_marks=40),
            ExamPaper(id=6, exam_id=2, classroom_id=3, subject_id=5, total_marks=100, pass_marks=40),
            ExamPaper(id=7, exam_id=3, classroom_id=4, subject_id=6, total_marks=100, pass_marks=40),
            ExamResult(exam_paper_id=1, student_enrollment_id=enrollments[1], obtained_marks=71),
            ExamResult(exam_paper_id=1, student_enrollment_id=enrollments[2], obtained_marks=72),
            ExamResult(exam_paper_id=2, student_enrollment_id=enrollments[1], obtained_marks=73),
            ExamResult(exam_paper_id=5, student_enrollment_id=enrollments[5], obtained_marks=74),
            ExamResult(exam_paper_id=6, student_enrollment_id=enrollments[6], obtained_marks=75),
            ExamResult(exam_paper_id=7, student_enrollment_id=enrollments[7], obtained_marks=76),
        ])
        self.db.commit()

        self.app = FastAPI()
        self.app.include_router(exam_papers.router)
        self.app.dependency_overrides[exam_papers.get_db] = lambda: self.db
        self.app.dependency_overrides[exam_papers.get_current_user] = lambda: self.actor
        self.app.dependency_overrides[exam_papers.get_active_session] = lambda: self.active
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)

    def delete(self, paper_id=1):
        return self.client.delete(f"/exam-papers/{paper_id}")

    def marks_for(self, paper_id):
        return self.db.query(ExamResult).filter_by(exam_paper_id=paper_id).count()

    def test_admin_deletes_paper_and_its_marks_only(self):
        preview = self.client.get("/exam-papers/1/deletion-preview")
        self.assertEqual(preview.status_code, 200, preview.text)
        self.assertEqual(preview.json(), {
            "paper_id": 1, "exam_name": "Final", "classroom_name": "Test Grade A",
            "subject_name": "Subject 1", "total_marks": 100, "result_count": 2,
        })

        response = self.delete()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {"paper_id": 1, "deleted_marks": 2})
        self.assertIsNone(self.db.get(ExamPaper, 1))
        self.assertEqual(self.marks_for(1), 0)

        # Same examination, another class, another tenant, and historical rows survive.
        self.assertIsNotNone(self.db.get(ExamPaper, 2))
        self.assertEqual(self.marks_for(2), 1)
        self.assertIsNotNone(self.db.get(ExamPaper, 5))
        self.assertEqual(self.marks_for(5), 1)
        self.assertIsNotNone(self.db.get(ExamPaper, 6))
        self.assertEqual(self.marks_for(6), 1)
        self.assertIsNotNone(self.db.get(ExamPaper, 7))
        self.assertEqual(self.marks_for(7), 1)

    def test_non_admins_and_users_without_school_membership_cannot_delete_or_preview(self):
        for role in ("teacher", "manager", "accountant", "viewer", None):
            with self.subTest(role=role):
                self.actor.org_role = role
                self.assertEqual(self.delete().status_code, 403)
                self.assertEqual(self.client.get("/exam-papers/1/deletion-preview").status_code, 403)
                self.assertIsNotNone(self.db.get(ExamPaper, 1))
                self.assertEqual(self.marks_for(1), 2)
        self.actor.org_role = "admin"
        self.actor.org_id = None
        self.assertEqual(self.delete().status_code, 403)
        self.assertIsNotNone(self.db.get(ExamPaper, 1))

    def test_authentication_is_required(self):
        self.app.dependency_overrides.pop(exam_papers.get_current_user)
        self.assertIn(self.delete().status_code, (401, 403))
        self.assertIsNotNone(self.db.get(ExamPaper, 1))
        self.assertEqual(self.marks_for(1), 2)

    def test_locked_and_published_exams_are_rejected_without_removing_marks(self):
        for locked, published in ((True, False), (False, True), (True, True)):
            with self.subTest(locked=locked, published=published):
                exam = self.db.get(Exam, 1)
                exam.is_locked, exam.is_published = locked, published
                self.db.commit()
                self.assertEqual(self.delete().status_code, 409)
                self.assertIsNotNone(self.db.get(ExamPaper, 1))
                self.assertEqual(self.marks_for(1), 2)

    def test_foreign_and_historical_papers_are_not_visible_to_current_session_deletion(self):
        for paper_id in (6, 7, 9999):
            with self.subTest(paper_id=paper_id):
                self.assertEqual(self.delete(paper_id).status_code, 404)
        self.assertIsNotNone(self.db.get(ExamPaper, 6))
        self.assertEqual(self.marks_for(6), 1)
        self.assertIsNotNone(self.db.get(ExamPaper, 7))
        self.assertEqual(self.marks_for(7), 1)

    def test_database_failure_rolls_back_paper_and_marks(self):
        with patch.object(self.db, "commit", side_effect=SQLAlchemyError("synthetic commit failure")):
            response = self.delete()
        self.assertEqual(response.status_code, 503, response.text)
        self.assertIsNotNone(self.db.get(ExamPaper, 1))
        self.assertEqual(self.marks_for(1), 2)
        self.assertEqual(self.delete().status_code, 200)


if __name__ == "__main__":
    unittest.main()
