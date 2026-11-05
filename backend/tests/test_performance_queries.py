"""Read query budgets and reconciliation using disposable synthetic data."""
from contextlib import contextmanager
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException
from redis import RedisError
from sqlalchemy import event

import test_exam_result_entry as exams
import test_fee_multi as fees
from app.models.attendance import Attendance
from app.models.exams import ClassSubject, ExamResult, GradeScale
from app.models.student_fee import StudentFee
from app.models.students import Student
from app.models.users import OrganizationMember
from app.routers import dashboard, exams_results, promotion, student_fee, subjects
from app.services.fee_reads import student_fee_history


@contextmanager
def query_budget(case, expected):
    statements = []
    case.db.expunge_all()
    def record(_connection, _cursor, statement, _parameters, _context, _many):
        statements.append(statement)
    event.listen(case.engine, "before_cursor_execute", record)
    try:
        yield
    finally:
        event.remove(case.engine, "before_cursor_execute", record)
    case.assertEqual(len(statements), expected)


class AcademicReadPerformanceTests(unittest.TestCase):
    def setUp(self):
        exams.ExamResultEntryTests.setUp(self)
        self.active = SimpleNamespace(id=1)
        self.db.add(OrganizationMember(id=1, user_id=1, organization_id=1, role="accountant"))
        self.db.add(GradeScale(organization_id=1, min_percentage=40, max_percentage=100, grade="A", gpa=4))
        self.db.add_all(ExamResult(exam_paper_id=paper, student_enrollment_id=enrollment, obtained_marks=50)
                        for enrollment in self.enrollments.values() for paper in range(1, 5))
        self.db.commit()

    def test_promotion_preview_batches_students_papers_and_marks_in_five_queries(self):
        with query_budget(self, 5):
            result = promotion.preview_promotion(1, 1, self.db, self.actor, self.active)
        self.assertEqual(len(result["passed_students"]), 4)
        self.assertEqual(result["failed_students"], [])
        self.assertTrue(all(row["percentage"] == 50 for row in result["passed_students"]))
        with self.assertRaises(HTTPException) as rejected:
            promotion.preview_promotion(1, 1, self.db, SimpleNamespace(org_id=2), self.active)
        self.assertEqual(rejected.exception.status_code, 404)

    def test_student_results_use_four_queries_for_all_subjects(self):
        with query_budget(self, 4):
            rows = exams_results.get_student_results(1, self.db, self.actor, self.active)
        self.assertEqual(len(rows), 4)
        self.assertEqual({(r.grade, r.gpa) for r in rows}, {("A", 4)})
        with self.assertRaises(HTTPException) as rejected:
            exams_results.get_student_results(1, self.db, SimpleNamespace(org_id=2), self.active)
        self.assertEqual(rejected.exception.status_code, 404)

    def test_subject_assignments_reuse_joins_in_two_queries(self):
        self.db.add_all(ClassSubject(classroom_id=1, subject_id=i) for i in range(1, 5))
        self.db.commit()
        with query_budget(self, 2):
            rows = subjects.get_all_assignments(self.db, self.actor, self.active)
        self.assertEqual(len(rows), 4)
        self.assertEqual({row["classroom_name"] for row in rows}, {"Test Grade"})
        self.assertEqual({row["subject_name"] for row in rows}, {f"Subject {i}" for i in range(1, 5)})

    def test_dashboard_aggregations_match_counts_and_cache_write_failure_is_optional(self):
        self.db.get(Student, 4).is_active = False
        self.db.add_all(Attendance(student_id=i, class_id=1, session_id=1, date=date.today(), status=status)
                        for i, status in ((1, "present"), (2, "absent"), (3, "late")))
        self.db.commit()
        cache = Mock()
        cache.get.return_value = None
        cache.set.side_effect = RedisError("Synthetic cache unavailable")
        with patch.object(dashboard, "redis_client", cache), query_budget(self, 10):
            result = dashboard.get_dashboard_stats(self.db, self.actor, self.active)
        self.assertEqual(result["overview"]["students"], {"total": 4, "active": 3, "inactive": 1})
        self.assertEqual(result["attendance"], {"total": 4, "present": 1, "absent": 1, "percentage": 25, "marked": True})
        self.assertEqual(result["overview"]["classes"], 1)


class FinancialReadPerformanceTests(unittest.TestCase):
    preview = fees.MultiFeeTests.preview
    confirm = fees.MultiFeeTests.confirm
    collect = fees.MultiFeeTests.collect
    advance = fees.MultiFeeTests.advance

    def setUp(self):
        fees.MultiFeeTests.setUp(self)

    def test_history_query_count_is_constant_with_twelve_fees_partial_cash_and_advance(self):
        fees.MultiFeeTests.collect(self, [f"2026-{month:02}" for month in range(4, 13)] + ["2027-01", "2027-02", "2027-03"],
                                  amount="100.00", key="perf-partial-payment")
        fees.MultiFeeTests.advance(self, amount="50.00", key="perf-advance-payment")
        with query_budget(self, 6):
            result = student_fee_history(self.db, self.actor, 1)
        self.assertEqual(result["total"], 12)
        self.assertEqual(result["sessions"][0]["paid"], "100.00")
        self.assertEqual(result["sessions"][0]["available_credit"], "50.00")
        self.assertEqual(result["sessions"][0]["cash_received"], "150.00")
        self.assertEqual(result["items"][0]["status"], "partial")

    def test_history_still_rejects_paid_amounts_that_do_not_match_allocations(self):
        self.db.get(StudentFee, 1).paid_amount = Decimal("1.00")
        self.db.commit()
        with self.assertRaises(HTTPException) as rejected:
            student_fee_history(self.db, self.actor, 1)
        self.assertEqual(rejected.exception.status_code, 409)

    def test_ledger_uses_two_queries_without_changing_financial_values(self):
        fees.MultiFeeTests.collect(self, ["2026-04"], amount="100.00", key="perf-ledger-partial")
        with query_budget(self, 2):
            result = student_fee.get_fee_ledger(1, "April", 1, 10, self.db, self.actor,
                                               SimpleNamespace(id=1, start_date=date(2026,4,1), end_date=date(2027,3,31)))
        row = result["items"][0]
        self.assertEqual((row["final_amount"], row["paid_amount"], row["due_amount"], row["status"]),
                         (1000, 100, 900, "partial"))
