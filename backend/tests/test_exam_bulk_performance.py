"""Bulk mark saves measured and verified only on disposable loopback PostgreSQL."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date
import os
from threading import Barrier
from time import perf_counter, sleep
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import event
from sqlalchemy.orm import Session

import test_fee_integrity as fixture
from app.models.classroom import Classroom, Grade
from app.models.exams import Exam, ExamPaper, ExamResult, GradeScale, Subject, Term
from app.models.student_enrollment import StudentEnrollment
from app.models.students import Student
from app.routers.exams_results import create_exam_results_bulk
from app.schemas.exam_result import ExamResultCreate


@unittest.skipUnless(os.environ.get("TEST_POSTGRES_URL"), "Requires disposable loopback PostgreSQL")
class BulkMarksPerformanceTests(unittest.TestCase):
    def setUp(self):
        fixture.FeeIntegrityTests.setUp(self)
        self.actor.org_role = "admin"
        self.active = SimpleNamespace(id=1)
        self.db.add(Term(id=1, name="First term", academic_year_id=1, organization_id=1))
        self.db.add_all(Subject(id=i, name=f"Subject {i}", session_id=1, organization_id=1) for i in range(1, 8))
        self.db.add_all(Student(id=i, first_name=f"Student {i}", admission_no=f"TEST-{i}", organization_id=1) for i in range(2, 7))
        self.db.flush()
        self.db.add(Exam(id=1, name="First Term Examination", term_id=1, organization_id=1,
                         start_date=date(2026, 11, 1), end_date=date(2026, 11, 10)))
        self.db.add_all(StudentEnrollment(student_id=i, classroom_id=1, session_id=1, is_active=True) for i in range(2, 7))
        self.db.add_all([GradeScale(organization_id=1, grade="F", min_percentage=0, max_percentage=39),
                         GradeScale(organization_id=1, grade="P", min_percentage=40, max_percentage=100),
                         GradeScale(organization_id=2, grade="Private", min_percentage=0, max_percentage=100)])
        self.db.flush()
        self.db.add_all(ExamPaper(id=i, exam_id=1, classroom_id=1, subject_id=i, total_marks=100, pass_marks=40) for i in range(1, 8))
        self.db.commit()
        self.enrollments = [row.id for row in self.db.query(StudentEnrollment).filter_by(session_id=1).order_by(StudentEnrollment.id)]
        self.request = [ExamResultCreate(exam_paper_id=paper, student_enrollment_id=enrollment, obtained_marks=50)
                        for paper in range(1, 8) for enrollment in self.enrollments]
        self.db.rollback()

    def save(self, request=None):
        return create_exam_results_bulk(self.request if request is None else request, self.db, self.actor, self.active)

    def test_42_marks_have_a_bounded_query_budget_for_insert_and_update(self):
        delay = float(os.environ.get("MARKS_TEST_SQL_DELAY_MS", "0")) / 1000
        for operation in ("insert", "update"):
            request = self.request if operation == "insert" else [row.model_copy(update={"obtained_marks": 75}) for row in self.request]
            statements = []
            repeated_updates = []
            def record(_connection, _cursor, statement, _parameters, _context, _many):
                statements.append(statement.split(None, 1)[0])
                if statement.startswith("UPDATE"):
                    repeated_updates.append(_many)
                if delay:
                    sleep(delay)
            event.listen(self.engine, "before_cursor_execute", record)
            started = perf_counter()
            try:
                response = self.save(request)
            finally:
                elapsed = perf_counter() - started
                event.remove(self.engine, "before_cursor_execute", record)
            reads = statements.count("SELECT")
            writes = sum(statements.count(word) for word in ("INSERT", "UPDATE", "DELETE"))
            print(f"MARKS_BENCHMARK {operation}: 42 marks, {len(statements)} SQL statements ({reads} SELECT, {writes} DML), {elapsed:.3f}s, injected_latency={delay * 1000:g}ms/statement", flush=True)
            self.assertEqual(len(response["succeeded"]), 42)
            self.assertEqual(response["failed"], [])
            if not os.environ.get("MARKS_TEST_BASELINE"):
                self.assertLessEqual(len(statements), 12)
                self.assertFalse(any(repeated_updates), "Updates must use one CASE statement, not per-row driver executemany")

    def test_existing_and_null_results_are_reused_and_zero_marks_get_school_grade(self):
        old = ExamResult(exam_paper_id=1, student_enrollment_id=self.enrollments[0], obtained_marks=None)
        self.db.add(old)
        self.db.commit()
        old_id = old.id
        request = [self.request[0].model_copy(update={"obtained_marks": 0}), self.request[1]]
        response = self.save(request)
        self.assertEqual(response["failed"], [])
        self.assertEqual([(row.id, row.obtained_marks, row.grade) for row in response["succeeded"]],
                         [(old_id, 0, "F"), (response["succeeded"][1].id, 50, "P")])
        self.assertEqual(self.db.query(ExamResult).count(), 2)

    def test_invalid_cells_fail_individually_and_valid_marks_are_saved(self):
        request = [self.request[0], self.request[1].model_copy(update={"obtained_marks": 101}),
                   self.request[2].model_copy(update={"exam_paper_id": 999}),
                   self.request[3].model_copy(update={"student_enrollment_id": 999})]
        response = self.save(request)
        self.assertEqual(len(response["succeeded"]), 1)
        self.assertEqual([row["index"] for row in response["failed"]], [1, 2, 3])
        self.assertEqual(self.db.query(ExamResult).count(), 1)

    def test_locked_or_published_exams_never_save_marks(self):
        for locked, published in ((True, False), (False, True), (True, True)):
            exam = self.db.get(Exam, 1)
            exam.is_locked, exam.is_published = locked, published
            self.db.commit()
            response = self.save()
            self.assertEqual(response["succeeded"], [])
            self.assertEqual(len(response["failed"]), 42)
            self.assertTrue(all(("locked" if locked else "published") in row["error"] for row in response["failed"]))
            self.assertEqual(self.db.query(ExamResult).count(), 0)

    def test_foreign_school_or_session_and_inactive_enrollment_are_rejected(self):
        for actor, active in ((SimpleNamespace(org_id=2, org_role="admin"), self.active),
                              (self.actor, SimpleNamespace(id=2))):
            response = create_exam_results_bulk(self.request, self.db, actor, active)
            self.assertEqual(response["succeeded"], [])
            self.assertEqual(len(response["failed"]), 42)
        self.db.get(StudentEnrollment, self.enrollments[0]).is_active = False
        self.db.commit()
        response = self.save()
        self.assertEqual(len(response["succeeded"]), 35)
        self.assertEqual(len(response["failed"]), 7)

    def test_duplicate_cells_reuse_one_result_and_keep_the_last_valid_value(self):
        request = [self.request[0].model_copy(update={"obtained_marks": value}) for value in (20, 75, 101)]
        response = self.save(request)
        self.assertEqual(len(response["succeeded"]), 2)
        self.assertEqual(response["succeeded"][0].id, response["succeeded"][1].id)
        self.assertEqual([row.obtained_marks for row in response["succeeded"]], [75, 75])
        self.assertEqual([row["index"] for row in response["failed"]], [2])
        self.assertEqual(self.db.query(ExamResult).one().obtained_marks, 75)

    def test_another_classroom_enrollment_is_not_accepted(self):
        self.db.add(Classroom(id=2, grade_id=1, organization_id=1, academic_year_id=1, section="B"))
        self.db.flush()
        self.db.get(StudentEnrollment, self.enrollments[0]).classroom_id = 2
        self.db.commit()
        response = self.save()
        self.assertEqual(len(response["succeeded"]), 35)
        self.assertEqual(len(response["failed"]), 7)
        self.assertEqual(self.db.query(ExamResult).filter_by(student_enrollment_id=self.enrollments[0]).count(), 0)

    def test_commit_failure_rolls_back_every_mark(self):
        existing = ExamResult(exam_paper_id=1, student_enrollment_id=self.enrollments[0], obtained_marks=25)
        self.db.add(existing)
        self.db.commit()
        old_id = existing.id
        with patch.object(self.db, "commit", side_effect=RuntimeError("Synthetic commit failure")):
            with self.assertRaises(HTTPException) as raised:
                self.save()
        self.assertGreaterEqual(raised.exception.status_code, 500)
        self.assertNotIn("Synthetic commit failure", str(raised.exception.detail))
        self.assertEqual([(row.id, row.obtained_marks) for row in self.db.query(ExamResult)], [(old_id, 25)])

    def test_concurrent_submissions_do_not_duplicate_results(self):
        barrier = Barrier(2)
        def save():
            with Session(self.engine) as db:
                barrier.wait(timeout=10)
                return create_exam_results_bulk(self.request, db, self.actor, self.active)
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda _: save(), range(2)))
        self.assertTrue(all(len(response["succeeded"]) == 42 and not response["failed"] for response in responses))
        self.assertEqual(self.db.query(ExamResult).count(), 42)


if __name__ == "__main__":
    unittest.main()
