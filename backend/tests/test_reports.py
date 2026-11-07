"""Report regressions run only against the guarded disposable PostgreSQL fixture."""
from datetime import date
from decimal import Decimal
import os
import unittest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import event

import test_bulk_exam_papers as paper_fixture
from app.models.attendance import Attendance
from app.models.employee import Employee
from app.models.salary_payments import SalaryPayment
from app.models.fee_transection import FeeTransaction
from app.models.users import OrganizationMember
from app.models.exams import ExamPaper, ExamResult, GradeScale
from app.models.students import Student
from app.models.student_enrollment import StudentEnrollment
from app.routers import reports
from app.services.fee_collection import collect_fee_payment


@unittest.skipUnless(os.environ.get('TEST_POSTGRES_URL'), 'Requires disposable PostgreSQL')
class ReportsTests(unittest.TestCase):
    def setUp(self):
        paper_fixture.BulkExamPaperTests.setUp(self)
        self.actor.org_role = 'admin'
        app = FastAPI()
        app.include_router(reports.router)
        app.dependency_overrides[reports.get_db] = lambda: self.db
        app.dependency_overrides[reports.get_current_user] = lambda: self.actor
        app.dependency_overrides[reports.get_active_session] = lambda: self.session
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.enrollment = self.db.query(StudentEnrollment).filter_by(student_id=1).one()
        self.db.add_all([ExamPaper(id=i, exam_id=1, classroom_id=1, subject_id=i, total_marks=100, pass_marks=40) for i in range(1, 5)])
        self.db.add_all([GradeScale(organization_id=1, grade='School Grade', min_percentage=40, max_percentage=100),
                         GradeScale(organization_id=2, grade='Other Grade', min_percentage=0, max_percentage=100)])
        self.db.commit()

    def get(self, path, **params):
        return self.client.get('/reports/' + path, params=params)

    def marks(self, values):
        for i, value in enumerate(values, 1):
            self.db.add(ExamResult(exam_paper_id=i, student_enrollment_id=self.enrollment.id, obtained_marks=value))
        self.db.commit()

    def test_complete_aggregate_and_school_grade(self):
        self.marks([20, 30, 80, 90])
        rows = self.get('exam-results').json()
        self.assertEqual(len(rows), 4)
        self.assertEqual({r['overall_result'] for r in rows}, {'PASSED'})
        self.assertEqual(rows[0]['overall_percentage'], 55)
        self.assertEqual(rows[0]['failed_count'], 2)
        self.assertEqual(rows[-1]['grade'], 'School Grade')

    def test_three_failed_subjects_override_aggregate(self):
        self.marks([39, 39, 39, 100])
        row = self.get('exam-results').json()[0]
        self.assertEqual(row['overall_percentage'], 54.25)
        self.assertEqual(row['overall_result'], 'FAILED')
        self.assertEqual(row['failed_count'], 3)
        self.assertEqual(self.get('exam-results', result='pass').json(), [])

    def test_missing_results_are_incomplete_not_failed_or_passed(self):
        self.marks([100, 100, 100])
        rows = self.get('exam-results', result='incomplete').json()
        self.assertEqual(len(rows), 4)
        self.assertEqual(rows[0]['missing_count'], 1)
        self.assertIsNone(rows[0]['overall_percentage'])
        self.assertIsNone(rows[-1]['obtained_marks'])

    def test_below_forty_fails_even_without_three_subject_failures(self):
        self.marks([40, 40, 40, 0])
        self.assertEqual(self.get('exam-results').json()[0]['overall_result'], 'FAILED')

    def test_empty_results_and_exam_filter_do_not_mix_exams(self):
        self.assertEqual(self.get('exam-results', exam_id=2).json(), [])
        self.assertEqual(self.get('exam-results', exam_id=999).json(), [])
        self.assertEqual(len(self.get('exam-results').json()), 4)

    def test_session_and_classroom_isolation(self):
        self.assertEqual(self.get('exam-results', session_id=2).status_code, 404)
        self.assertEqual(self.get('exam-results', session_id=3).json(), [])
        self.assertEqual(self.get('class/2').status_code, 404)
        self.assertEqual(self.get('students', session_id=3).json(), [])

    def test_schoolwide_reports_and_financials_deny_teachers(self):
        self.actor.org_role = 'teacher'
        for path in ('students', 'exam-results', 'attendance', 'fees', 'payroll', 'payroll/1', 'class/1'):
            with self.subTest(path=path):
                self.assertEqual(self.get(path).status_code, 403)

    def test_students_include_session_withdrawals_once(self):
        self.enrollment.is_active = False
        self.db.commit()
        self.assertEqual(len(self.get('students').json()), 1)
        self.assertEqual(self.get('students', status='active').json(), [])
        self.assertEqual(len(self.get('students', status='inactive').json()), 1)
        self.assertEqual(self.get('students', gender='female').json(), [])

    def test_unassigned_enrollment_is_still_counted(self):
        self.enrollment.classroom_id = None
        self.db.commit()
        rows = self.get('students').json()
        self.assertEqual(len(rows), 1)
        self.assertIsNone(rows[0]['grade_name'])

    def test_populated_other_school_is_never_returned(self):
        self.db.add(Student(id=2, organization_id=2, first_name='PRIVATE', admission_no='PRIVATE'))
        self.db.flush()
        foreign = StudentEnrollment(student_id=2, session_id=2, classroom_id=2, is_active=True)
        self.db.add(foreign)
        self.db.flush()
        self.db.add(ExamPaper(id=8, exam_id=2, classroom_id=2, subject_id=8, total_marks=100, pass_marks=40))
        self.db.flush()
        self.db.add(ExamResult(exam_paper_id=8, student_enrollment_id=foreign.id, obtained_marks=100))
        self.db.commit()
        for endpoint in ('students', 'exam-results', 'attendance', 'fees', 'payroll'):
            self.assertNotIn('PRIVATE', self.get(endpoint).text)
        self.actor.org_id = 2
        self.assertEqual(self.get('exam-results').json()[0]['student_name'], 'PRIVATE')
        self.assertEqual(self.get('class/1').status_code, 404)

    def test_anonymous_reports_are_rejected(self):
        self.client.app.dependency_overrides.pop(reports.get_current_user)
        self.assertIn(self.get('exam-results').status_code, (401, 403))

    def test_attendance_counts_only_records_and_exposes_late(self):
        for day, status in enumerate(('present', 'absent', 'leave', 'late'), 1):
            self.db.add(Attendance(student_id=1, class_id=1, session_id=1, date=date(2026, 4, day), status=status))
        self.db.commit()
        row = self.get('attendance', month='April').json()[0]
        self.assertEqual((row['total_days'], row['present'], row['absent'], row['leave'], row['late']), (4, 1, 1, 1, 1))
        self.assertEqual(row['attendance_pct'], 25)
        self.assertEqual(self.get('attendance', start_date='2026-04-03', end_date='2026-04-02').status_code, 422)

    def test_missing_attendance_is_not_absent(self):
        row = self.get('attendance').json()[0]
        self.assertIsNone(row['attendance_pct'])
        self.assertEqual(row['absent'], 0)

    def test_fee_report_reconciles_partial_payments_without_duplicate_cash(self):
        collect_fee_payment(self.db, self.actor, 1, Decimal('250'), 'report-payment-key')
        self.db.add(FeeTransaction(organization_id=1, student_id=1, session_id=1, amount=500,
                                  receipt_no='ADVANCE-FIXTURE', created_by=1))
        self.db.commit()
        response = self.get('fees').json()
        self.assertEqual(response['total_paid'], 250)
        self.assertEqual(response['total_pending'], 750)
        self.assertEqual(response['items'][0]['status'], 'partial')
        self.assertEqual(response['session_cash_received'], 750)
        self.assertEqual(response['session_advance_credit'], 500)

    def test_dashboard_excludes_other_session_salary_and_classes(self):
        from app.routers.dashboard import get_dashboard_stats
        self.db.add(OrganizationMember(id=1, organization_id=1, user_id=1, role='admin'))
        self.db.add(Employee(id=1, organization_id=1, full_name='Fixture Staff', role='teacher'))
        self.db.flush()
        self.db.add(SalaryPayment(organization_id=1, employee_id=1, session_id=3, month=4, year=date.today().year,
                                  gross_amount=1000, deductions=0, bonus=0, net_amount=1000, status='paid'))
        self.db.commit()
        result = get_dashboard_stats(self.db, self.actor, self.session)
        self.assertEqual(result['financials']['expenses']['salaryYearTotal'], 0)
        self.assertEqual(result['overview']['classes'], 1)

    def test_payroll_uses_real_employee_model_and_payment_status(self):
        self.db.add(Employee(id=1, organization_id=1, full_name='Fixture Staff', role='teacher'))
        self.db.flush()
        self.db.add(SalaryPayment(organization_id=1, employee_id=1, session_id=1, month=4, year=2026,
                                  gross_amount=1000, deductions=100, bonus=50, net_amount=950, status='paid'))
        self.db.commit()
        row = self.get('payroll', month='April').json()[0]
        self.assertEqual(row['paid_amount'], 950)
        self.assertEqual(self.get('payroll', status='unpaid').json(), [])
        self.assertEqual(self.get('payroll/1').status_code, 410)

    def test_query_count_is_bounded_for_exam_and_attendance(self):
        # Exclude the dependency's one-time expired session refresh; authenticate
        # and session resolution are outside these report query budgets.
        self.session.id
        statements = []
        def count(*args): statements.append(args[2])
        event.listen(self.engine, 'before_cursor_execute', count)
        try:
            self.assertEqual(self.get('exam-results').status_code, 200)
            self.assertLessEqual(len(statements), 5)
            statements.clear()
            self.assertEqual(self.get('attendance').status_code, 200)
            self.assertLessEqual(len(statements), 3)
        finally:
            event.remove(self.engine, 'before_cursor_execute', count)
