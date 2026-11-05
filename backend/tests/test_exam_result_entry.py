"""Class-wide marks entry against synthetic fixtures and the existing API services."""
from datetime import date
import unittest

from fastapi import HTTPException

import test_fee_integrity as fixture
from app.models.exams import Exam, ExamPaper, ExamResult, Subject, Term
from app.models.student_enrollment import StudentEnrollment
from app.models.students import Student
from app.routers.exams_results import create_exam_result, create_exam_results_bulk, get_exam_results
from app.routers.promotion import preview_promotion
from app.schemas.exam_result import ExamResultCreate


class ExamResultEntryTests(unittest.TestCase):
    def setUp(self):
        fixture.FeeIntegrityTests.setUp(self)
        self.db.add(Term(id=1, name="Term 1", academic_year_id=1, organization_id=1))
        self.db.flush()
        self.exam = Exam(id=1, name="Final", start_date=date(2026, 10, 1), end_date=date(2026, 10, 7),
                         term_id=1, organization_id=1)
        self.db.add(self.exam)
        self.db.add_all(Subject(id=i, name=f"Subject {i}", organization_id=1, session_id=1) for i in range(1, 5))
        self.db.add_all(Student(id=i, first_name=f"Student {i}", admission_no=f"TEST-{i}", organization_id=1)
                        for i in range(2, 5))
        self.db.flush()
        self.db.add_all(ExamPaper(id=i, exam_id=1, classroom_id=1, subject_id=i, total_marks=100, pass_marks=40)
                        for i in range(1, 5))
        self.db.add_all(StudentEnrollment(student_id=i, session_id=1, classroom_id=1) for i in range(2, 5))
        self.db.commit()
        self.enrollments = {row.student_id: row.id for row in self.db.query(StudentEnrollment).all()}

    def mark(self, paper, student, value):
        return ExamResultCreate(exam_paper_id=paper, student_enrollment_id=self.enrollments[student], obtained_marks=value)

    def bulk(self, *marks):
        return create_exam_results_bulk(list(marks), self.db, self.actor, self.session)

    def test_bulk_reuses_result_and_reports_only_the_invalid_cell_as_failed(self):
        enrollment = self.enrollments[1]
        existing = ExamResult(exam_paper_id=1, student_enrollment_id=enrollment, obtained_marks=20)
        missing = ExamResult(exam_paper_id=2, student_enrollment_id=enrollment, obtained_marks=None)
        self.db.add_all([existing, missing])
        self.db.commit()
        self.assertEqual([result.id for result in get_exam_results(1, self.db, self.actor, self.session)], [existing.id])

        response = self.bulk(self.mark(1, 1, 41), self.mark(2, 1, 0), self.mark(3, 1, 101))
        self.assertEqual({result.id: result.obtained_marks for result in response["succeeded"]}, {existing.id: 41, missing.id: 0})
        self.assertEqual([row["index"] for row in response["failed"]], [2])
        self.assertEqual(self.db.query(ExamResult).count(), 2)

    def test_locked_exam_rejects_bulk_and_single_writes(self):
        self.bulk(self.mark(1, 1, 35))
        self.exam.is_locked = True
        self.db.commit()
        response = self.bulk(self.mark(1, 1, 40), self.mark(2, 1, 48))
        self.assertEqual(response["succeeded"], [])
        self.assertEqual([row["error"] for row in response["failed"]], ["Exam is locked"] * 2)
        with self.assertRaises(HTTPException) as raised:
            create_exam_result(self.mark(2, 1, 48), self.db, self.actor, self.session)
        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(self.db.query(ExamResult).one().obtained_marks, 35)

    def test_existing_promotion_preview_returns_shared_overall_evaluation(self):
        rows = [(40, 40, 40, 40), (39, 39, 40, 41), (39, 39, 39, 90), (90,)]
        response = self.bulk(*(self.mark(paper, student, value)
                               for student, marks in enumerate(rows, 1) for paper, value in enumerate(marks, 1)))
        self.assertEqual(response["failed"], [])
        summary = preview_promotion(1, 1, self.db, self.actor, self.session)
        self.assertEqual([(r["student_id"], r["percentage"], r["result"]) for r in summary["passed_students"]],
                         [(1, 40.0, "PASSED")])
        self.assertEqual({r["student_id"]: (r["percentage"], r["failed_count"]) for r in summary["failed_students"]},
                         {2: (39.75, 2), 3: (51.75, 3)})
        self.assertEqual([row["student_id"] for row in summary["no_result_students"]], [4])
