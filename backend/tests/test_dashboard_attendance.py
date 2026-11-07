"""Attendance summaries use synthetic isolated SQLite (or guarded local PG) only."""
from datetime import date, datetime, timezone
import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import event

import test_fee_integrity as fixture
from app.models.attendance import Attendance
from app.models.academic_session import AcademicSession
from app.models.classroom import Classroom, Grade
from app.models.students import Student
from app.models.student_enrollment import StudentEnrollment
from app.models.users import OrganizationMember
from app.services.dashboard_attendance import dashboard_attendance_summary, school_day_context
from app.routers.dashboard import get_dashboard_stats


NOW = datetime(2026, 11, 7, 12, tzinfo=timezone.utc)


class DashboardAttendanceTests(unittest.TestCase):
    def setUp(self):
        fixture.FeeIntegrityTests.setUp(self)
        self.addCleanup(patch.stopall)
        patch.dict(os.environ, {"SCHOOL_TIMEZONE": "UTC", "SCHOOL_CALENDAR_CONFIG": "{}"}).start()
        self.db.add_all([
            AcademicSession(id=3, organization_id=1, name="Earlier", is_active=False,
                            start_date=date(2025, 4, 1), end_date=date(2026, 3, 31)),
            Grade(id=2, organization_id=2, name="Other"),
            OrganizationMember(id=1, organization_id=1, user_id=1, role="admin"),
        ])
        self.db.flush()
        self.db.add_all([
            Classroom(id=2, grade_id=2, section="A", organization_id=2, academic_year_id=2),
            Classroom(id=3, grade_id=1, section="Old", organization_id=1, academic_year_id=3),
        ])
        self.db.add_all(Student(id=i, organization_id=2 if i == 12 else 1, first_name=f"Test {i}",
                                admission_no=f"ATT-{i}", is_active=i != 8) for i in range(2, 13))
        self.db.flush()
        self.db.add_all(StudentEnrollment(student_id=i, classroom_id=1, session_id=1, is_active=i != 9,
            enrollment_date=date(2026, 11, 8) if i == 10 else date(2026, 4, 1),
            withdrawal_date=date(2026, 11, 6) if i == 11 else None) for i in range(2, 13))
        self.db.add(StudentEnrollment(student_id=12, classroom_id=2, session_id=2, is_active=True, enrollment_date=date(2026, 4, 1)))
        self.db.add_all(Attendance(student_id=i, class_id=1, session_id=1, date=NOW.date(), status=status)
                        for i, status in [(1, "present"), (2, "absent"), (3, "leave"), (4, "late"), (6, "excused"), (8, "present"), (12, "present")])
        self.db.add_all([
            Attendance(student_id=5, class_id=1, session_id=3, date=NOW.date(), status="present"),
            Attendance(student_id=7, class_id=3, session_id=1, date=NOW.date(), status="absent"),
            Attendance(student_id=12, class_id=2, session_id=2, date=NOW.date(), status="present"),
            Attendance(student_id=5, class_id=1, session_id=1, date=date(2026, 11, 6), status="absent"),
        ])
        self.db.commit()
        # Warm ORM metadata before measuring the summary's fixed SQL count.
        self.session = self.db.get(AcademicSession, 1)
        self.session.start_date

    def summary(self, **kwargs):
        return dashboard_attendance_summary(self.db, org_id=1, active_session=self.session, class_ids=[1, 2, 3], now=NOW, **kwargs)

    def test_exact_counts_missing_records_are_not_absence(self):
        result = self.summary()
        self.assertEqual({key: result[key] for key in ("total", "present", "absent", "leave", "late", "other", "not_marked")},
                         dict(total=7, present=1, absent=1, leave=1, late=1, other=1, not_marked=2))
        self.assertEqual(result["percentage"], 14.29)
        self.assertEqual(sum(result[key] for key in ("present", "absent", "leave", "late", "other", "not_marked")), result["total"])
        self.assertEqual(result["date"], "2026-11-07")
        self.assertIsNone(result["is_school_day"])

    def test_other_organization_and_session_are_isolated(self):
        other = dashboard_attendance_summary(self.db, org_id=2, active_session=self.db.get(AcademicSession, 2), class_ids=[1, 2], now=NOW)
        self.assertEqual((other["total"], other["present"], other["absent"]), (1, 1, 0))
        old = dashboard_attendance_summary(self.db, org_id=1, active_session=self.db.get(AcademicSession, 3), class_ids=[1, 3], now=NOW)
        self.assertEqual(old["total"], 0)

    def test_teacher_class_scope_cannot_include_other_classes(self):
        result = dashboard_attendance_summary(self.db, org_id=1, active_session=self.session, class_ids=[], now=NOW)
        self.assertEqual((result["total"], result["present"], result["percentage"]), (0, 0, 0))

    def test_dashboard_teacher_only_sees_assigned_classes(self):
        self.actor.org_role = "teacher"
        self.db.get(OrganizationMember, 1).role = "teacher"
        self.db.commit()
        context = school_day_context(1, self.session, now=NOW)
        with patch("app.services.dashboard_attendance.school_day_context", return_value=context):
            self.assertEqual(get_dashboard_stats(self.db, self.actor, self.session)["attendance"]["total"], 0)
            self.db.get(Classroom, 1).class_teacher_member_id = 1
            self.db.commit()
            self.assertEqual(get_dashboard_stats(self.db, self.actor, self.session)["attendance"]["total"], 7)

    def test_status_whitespace_and_case_do_not_invent_absence(self):
        self.db.query(Attendance).filter_by(student_id=1, class_id=1, session_id=1).update({"status": " PRESENT "})
        self.db.commit()
        self.assertEqual(self.summary()["present"], 1)

    def test_no_marks_means_all_eligible_students_are_not_marked(self):
        result = dashboard_attendance_summary(self.db, org_id=1, active_session=self.session, class_ids=[1],
                                              now=datetime(2026, 11, 9, tzinfo=timezone.utc))
        self.assertEqual(result["total"], result["not_marked"])
        self.assertFalse(result["marked"])
        self.assertEqual(result["absent"], 0)

    def test_school_timezone_crosses_utc_midnight_and_falls_back_safely(self):
        with patch.dict(os.environ, {"SCHOOL_CALENDAR_CONFIG": '{"1":{"timezone":"Asia/Karachi"}}'}):
            context = school_day_context(1, self.session, now=datetime(2026, 11, 6, 23, 30, tzinfo=timezone.utc))
            self.assertEqual(context["date"], date(2026, 11, 7))
            self.assertEqual(context["timezone"], "Asia/Karachi")
            self.assertEqual(school_day_context(2, self.session, now=NOW)["timezone"], "UTC")
        for config in ('{"1":{"timezone":"invalid-zone"}}', 'not json'):
            with patch.dict(os.environ, {"SCHOOL_CALENDAR_CONFIG": config}):
                self.assertEqual(school_day_context(1, self.session, now=NOW)["timezone"], "UTC")

    def test_non_school_days_preserve_recorded_counts(self):
        with patch.dict(os.environ, {"SCHOOL_CALENDAR_CONFIG": '{"1":{"holidays":["2026-11-07"]}}'}):
            result = self.summary()
            self.assertFalse(result["is_school_day"])
            self.assertEqual(result["non_school_day_reason"], "holiday")
            self.assertEqual(result["present"], 1)
        with patch.dict(os.environ, {"SCHOOL_CALENDAR_CONFIG": '{"1":{"non_school_weekdays":[5]}}'}):
            self.assertEqual(self.summary()["non_school_day_reason"], "non_school_weekday")

    def test_single_read_only_query_and_no_attendance_mutation(self):
        before = [(row.id, row.status, row.date) for row in self.db.query(Attendance).order_by(Attendance.id)]
        statements = []
        def capture(_conn, _cursor, statement, *_args):
            statements.append(statement)
        event.listen(self.engine, "before_cursor_execute", capture)
        try:
            self.summary()
        finally:
            event.remove(self.engine, "before_cursor_execute", capture)
        self.assertEqual(len(statements), 1)
        self.assertTrue(statements[0].lstrip().upper().startswith("SELECT"))
        self.assertEqual([(row.id, row.status, row.date) for row in self.db.query(Attendance).order_by(Attendance.id)], before)

    def test_existing_dashboard_response_reuses_summary_and_membership_guard(self):
        context = school_day_context(1, self.session, now=NOW)
        with patch("app.services.dashboard_attendance.school_day_context", return_value=context):
            result = get_dashboard_stats(self.db, self.actor, self.session)
        self.assertEqual(result["attendance"]["total"], 7)
        self.assertIn("financials", result)
        self.actor.org_id = 99
        with self.assertRaises(HTTPException) as failure:
            get_dashboard_stats(self.db, self.actor, self.session)
        self.assertEqual(failure.exception.status_code, 403)
