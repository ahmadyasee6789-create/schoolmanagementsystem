"""Direct route, schema, and relational regression tests using synthetic local data.

No production configuration or database connection is used by these tests.
"""
import os
import unittest
from datetime import date, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import HTTPException
from pydantic import TypeAdapter, ValidationError
from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

with patch.dict(os.environ, {"DATABASE_URL": "sqlite://"}):
    from app.routers import dashboard, expenses, fee_structure, fee_voucher, organizationInvite, payroll, reports, students

import app.models
from app.crud import student as student_crud
from app.db.base import Base
from app.financial_permissions import (
    FINANCIAL_PERMISSIONS, has_financial_permission,
    require_discount_access, require_financial_permission,
)
from app.models.academic_session import AcademicSession
from app.models.classroom import Classroom, Grade
from app.models.expensecategory import ExpenseCategory
from app.models.expenses import Expense
from app.models.fee_structure import FeeStructure
from app.models.fee_transection import FeeTransaction
from app.models.fee_allocation import FeeAllocation
from app.models.student_enrollment import StudentEnrollment
from app.models.student_fee import StudentFee
from app.models.students import Student
from app.models.users import Invitation, Organization, OrganizationMember, User
from app.schemas.expenses import ExpenseCreate
from app.schemas.fee_structure import FeeStructureCreate, FeeStructureOut, FeeStructureUpdate
from app.schemas.payroll import SalaryPay, StaffSalaryCreate, StaffSalaryUpdate
from app.schemas.student import DiscountPercent, StudentUpdate, StudentWithEnrollmentCreate


def actor(role="admin", org_id=1):
    return SimpleNamespace(id=1, org_id=org_id, org_role=role)


class FinancialValidationTests(unittest.TestCase):
    def test_role_matrix_fails_closed(self):
        for role in ["admin", "manager", "accountant", "teacher", "viewer", "student", "owner", None]:
            for action, allowed in FINANCIAL_PERMISSIONS.items():
                with self.subTest(role=role, action=action):
                    self.assertEqual(has_financial_permission(actor(role), action), role in allowed)
                    if role in allowed:
                        require_financial_permission(actor(role), action)
                    else:
                        with self.assertRaises(HTTPException) as raised:
                            require_financial_permission(actor(role), action)
                        self.assertEqual(raised.exception.status_code, 403)
        self.assertFalse(has_financial_permission(actor(), "unknown-action"))

    def test_discount_validation_and_approval_roles(self):
        for value in [-1, 100.01, "NaN", "Infinity", "-Infinity", "1.001", True, None]:
            with self.subTest(value=value):
                with self.assertRaises(ValidationError):
                    TypeAdapter(DiscountPercent).validate_python(value)
                with self.assertRaises(HTTPException) as raised:
                    require_discount_access(actor(), value)
                self.assertEqual(raised.exception.status_code, 422)
        for value in [0, "12.50", 100]:
            self.assertEqual(TypeAdapter(DiscountPercent).validate_python(value), Decimal(str(value)))
        for role in ["admin", "manager"]:
            require_discount_access(actor(role), Decimal("12.50"))
        for role in ["accountant", "teacher", "viewer"]:
            require_discount_access(actor(role), Decimal("0"))
            with self.assertRaises(HTTPException) as raised:
                require_discount_access(actor(role), Decimal("0.01"))
            self.assertEqual(raised.exception.status_code, 403)

    def test_fee_structure_rejects_invalid_money(self):
        for field in ["monthly_fee", "admission_fee", "exam_fee"]:
            for value in [-1, "NaN", "Infinity", "1.001", "100000000", True, None]:
                with self.subTest(field=field, value=value):
                    data = dict(class_id=1, session_id=1, monthly_fee="100.00")
                    data[field] = value
                    with self.assertRaises(ValidationError):
                        FeeStructureCreate(**data)
        output = FeeStructureOut(id=1, class_id=1, session_id=1, class_name="Grade A", monthly_fee="12.50")
        self.assertEqual(output.model_dump(mode="json")["monthly_fee"], 12.5)

    def test_payroll_and_expenses_reject_invalid_money(self):
        for value in [-1, "NaN", "Infinity", "1.001", "100000000", True]:
            with self.subTest(value=value):
                with self.assertRaises(ValidationError):
                    ExpenseCreate(category_id=1, description="Supplies", amount=value)
                with self.assertRaises(ValidationError):
                    StaffSalaryCreate(employee_id=1, base_salary=value, effective_from=date(2026, 1, 1))
                with self.assertRaises(ValidationError):
                    StaffSalaryUpdate(base_salary=value)
                for field in ["deductions", "bonus"]:
                    with self.assertRaises(ValidationError):
                        SalaryPay(payment_method="cash", **{field: value})
        with self.assertRaises(ValidationError):
            ExpenseCreate(category_id=1, description="Supplies", amount=0)
        with self.assertRaises(ValidationError):
            StaffSalaryUpdate(base_salary=None)
        self.assertEqual(StaffSalaryUpdate().model_dump(exclude_unset=True), {})
        self.assertEqual(SalaryPay(payment_method="cash", bonus="12.50").bonus, Decimal("12.50"))

    def test_every_payroll_and_expense_endpoint_has_finance_dependency(self):
        for module, guard in [(payroll, payroll.require_payroll_access), (expenses, expenses.require_expense_access)]:
            for route in module.router.routes:
                with self.subTest(path=route.path):
                    self.assertIn(guard, [dependency.call for dependency in route.dependant.dependencies])
            for role in ["teacher", "viewer"]:
                with self.assertRaises(HTTPException) as raised:
                    guard(actor(role))
                self.assertEqual(raised.exception.status_code, 403)
            for role in ["admin", "manager", "accountant"]:
                guard(actor(role))

    def test_fee_reports_and_vouchers_reject_nonfinance_before_reading(self):
        endpoints = [
            (reports.get_fee_report, {}),
            (reports.payroll_report, {"teacher_id": 1}),
            (fee_voucher.print_fee_voucher, {"fee_id": 1, "due_date": date(2026, 1, 1)}),
            (fee_voucher.print_bulk_fee_vouchers, {"class_id": 1, "month": "January", "due_date": date(2026, 1, 1)}),
        ]
        for endpoint, kwargs in endpoints:
            with self.subTest(endpoint=endpoint.__name__):
                with self.assertRaises(HTTPException) as raised:
                    endpoint(db=None, current_user=actor("teacher"), active_session=None, **kwargs)
                self.assertEqual(raised.exception.status_code, 403)

    def test_dashboard_redacts_financial_data_without_changing_payload_shape(self):
        response = {"overview": {"students": 2}, "financials": {
            "year": 2026, "revenue": {"yearTotal": 123},
            "expenses": {"yearTotal": 5, "salaryYearTotal": 6, "pendingSalaryTotal": 7, "combinedYearTotal": 11},
            "net": {"yearTotal": 112}, "monthlyComparison": [
                {"month": "January", "revenue": 123, "expense": 5, "salary": 6, "total_expense": 11, "net": 112}],
        }}
        redacted = dashboard.redact_dashboard_financials(response, actor("teacher"))
        self.assertEqual(redacted["overview"], response["overview"])
        self.assertEqual(redacted["financials"]["revenue"]["yearTotal"], 0)
        self.assertTrue(all(v == 0 for k, v in redacted["financials"]["monthlyComparison"][0].items() if k != "month"))
        self.assertIs(dashboard.redact_dashboard_financials(response, actor("accountant")), response)
        self.assertEqual(response["financials"]["revenue"]["yearTotal"], 123)

    def test_salary_payment_rejects_negative_or_overflowing_net_before_write(self):
        for gross, deductions, bonus in [(100, 101, 0), (Decimal("99999999.99"), 0, 1), (Decimal("NaN"), 0, 0), (-1, 0, 2)]:
            with self.subTest(gross=gross, deductions=deductions, bonus=bonus):
                payment = SimpleNamespace(status="pending", gross_amount=gross)
                db = Mock()
                db.query.return_value.filter.return_value.first.return_value = payment
                with self.assertRaises(HTTPException) as raised:
                    payroll.pay_salary(1, SalaryPay(payment_method="cash", deductions=deductions, bonus=bonus),
                                       db=db, current_user=actor(), active_session=SimpleNamespace(id=1))
                self.assertEqual(raised.exception.status_code, 422)
                db.commit.assert_not_called()
                self.assertEqual(payment.status, "pending")


class FinancialRelationshipTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        event.listen(self.engine, "connect", lambda dbapi, _: dbapi.execute("PRAGMA foreign_keys=ON"))
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.db.add_all([Organization(id=1, name="School"), Organization(id=2, name="Other"),
                         User(id=1, full_name="Admin", email="admin@example.test")])
        self.db.flush()
        self.db.add_all([
            AcademicSession(id=1, organization_id=1, name="2026", is_active=True, start_date=date(2026, 1, 1), end_date=date(2026, 12, 31)),
            AcademicSession(id=2, organization_id=1, name="2025", is_active=False, start_date=date(2025, 1, 1), end_date=date(2025, 12, 31)),
            AcademicSession(id=3, organization_id=2, name="2026", is_active=True, start_date=date(2026, 1, 1), end_date=date(2026, 12, 31)),
            Grade(id=1, organization_id=1, name="One"), Grade(id=2, organization_id=2, name="Two"),
            Student(id=1, organization_id=1, admission_no="1", first_name="One"),
            Student(id=2, organization_id=2, admission_no="2", first_name="Other"),
        ])
        self.db.flush()
        self.db.add_all([
            Classroom(id=1, organization_id=1, grade_id=1, section="A", academic_year_id=1),
            Classroom(id=2, organization_id=1, grade_id=1, section="Old", academic_year_id=2),
            Classroom(id=3, organization_id=2, grade_id=2, section="Other", academic_year_id=3),
            Classroom(id=4, organization_id=1, grade_id=2, section="Bad Grade", academic_year_id=1),
            Classroom(id=5, organization_id=1, grade_id=1, section="Bad Session", academic_year_id=3),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def assert_http(self, status, function, *args, **kwargs):
        with self.assertRaises(HTTPException) as raised:
            function(*args, **kwargs)
        self.assertEqual(raised.exception.status_code, status)

    def create_structure(self):
        return fee_structure.create_fee_structure(FeeStructureCreate(class_id=1, session_id=1, monthly_fee="100.25"),
                                                  db=self.db, current_user=actor())

    def add_fee_history(self):
        fee = StudentFee(student_id=1, organization_id=1, class_id=1, session_id=1, month="January", billing_period=date(2026, 1, 1),
                         monthly_fee=100, admission_fee=0, exam_fee=0, total_amount=100,
                         discount_percent=0, discount_amount=0, final_amount=100, paid_amount=10, status="partial")
        self.db.add(fee)
        self.db.flush()
        payment = FeeTransaction(student_fee_id=fee.id, organization_id=1, student_id=1, session_id=1, amount=10, receipt_no="REC-TEST", created_by=1)
        self.db.add(payment)
        self.db.flush()
        self.db.add(FeeAllocation(transaction_id=payment.id, student_fee_id=fee.id, organization_id=1, student_id=1, session_id=1, amount=10))
        self.db.commit()
        return fee

    def test_structure_create_rejects_foreign_or_mismatched_class_session_grade(self):
        for class_id, session_id in [(3, 3), (1, 3), (3, 1), (1, 2), (4, 1), (5, 3), (999, 1), (1, 999)]:
            with self.subTest(class_id=class_id, session_id=session_id):
                self.assert_http(400, fee_structure.create_fee_structure,
                                 FeeStructureCreate(class_id=class_id, session_id=session_id, monthly_fee=100),
                                 db=self.db, current_user=actor())
        self.assertEqual(self.db.query(FeeStructure).count(), 0)

    def test_expense_category_must_belong_to_current_organization(self):
        self.db.add_all([ExpenseCategory(id=1, organization_id=1, name="Supplies"),
                         ExpenseCategory(id=2, organization_id=2, name="Private")])
        self.db.commit()
        for category_id in [2, 999]:
            self.assert_http(404, expenses.add_expenses,
                             ExpenseCreate(category_id=category_id, description="Supplies", amount="12.50"),
                             db=self.db, current_user=actor(), active_session=self.db.get(AcademicSession, 1))
        self.assertEqual(self.db.query(Expense).count(), 0)
        result = expenses.add_expenses(ExpenseCreate(category_id=1, description="Supplies", amount="12.50"),
                                       db=self.db, current_user=actor(), active_session=self.db.get(AcademicSession, 1))
        self.assertEqual(result.organization_id, 1)
        self.assertEqual(result.amount, Decimal("12.50"))

    def test_only_admin_can_list_role_granting_invitation_tokens(self):
        membership = OrganizationMember(organization_id=1, user_id=1, role="teacher")
        self.db.add_all([
            membership,
            Invitation(email="invited@example.test", role="admin", token="synthetic-invite-school-one",
                       organization_id=1, expires_at=datetime.now() + timedelta(days=1), accepted=False),
            Invitation(email="other@example.test", role="admin", token="synthetic-invite-school-two",
                       organization_id=2, expires_at=datetime.now() + timedelta(days=1), accepted=False),
        ])
        self.db.commit()
        for role in ["teacher", "accountant", "manager", "viewer"]:
            membership.role = role
            self.db.commit()
            self.assert_http(403, organizationInvite.list_invitations, db=self.db, current_user=actor(role))
        membership.role = "admin"
        self.db.commit()
        invitations = organizationInvite.list_invitations(db=self.db, current_user=actor())
        self.assertEqual(len(invitations), 1)
        self.assertEqual(invitations[0].organization_id, 1)

    def test_structure_update_rejects_foreign_references_without_mutation(self):
        result = self.create_structure()
        self.assertEqual(result["class_name"], "One - A")
        for class_id, session_id in [(3, 3), (1, 3), (1, 2), (4, 1)]:
            self.assert_http(400, fee_structure.update_fee_structure, result["id"],
                             FeeStructureUpdate(class_id=class_id, session_id=session_id, monthly_fee=999),
                             db=self.db, current_user=actor())
            self.db.expire_all()
            self.assertEqual(self.db.get(FeeStructure, result["id"]).monthly_fee, Decimal("100.25"))
        self.assert_http(404, fee_structure.update_fee_structure, result["id"],
                         FeeStructureUpdate(class_id=3, session_id=3, monthly_fee=999),
                         db=self.db, current_user=actor(org_id=2))

    def test_fee_structure_mutations_are_admin_only_but_finance_can_read(self):
        result = self.create_structure()
        for role in ["manager", "accountant", "teacher", "viewer"]:
            current_user = actor(role)
            self.assert_http(403, fee_structure.create_fee_structure,
                             FeeStructureCreate(class_id=2, session_id=2, monthly_fee=100), db=self.db, current_user=current_user)
            self.assert_http(403, fee_structure.update_fee_structure, result["id"],
                             FeeStructureUpdate(class_id=1, session_id=1, monthly_fee=101), db=self.db, current_user=current_user)
            self.assert_http(403, fee_structure.delete_fee_structure, result["id"], db=self.db, current_user=current_user)
        for role in ["admin", "manager", "accountant"]:
            response = fee_structure.get_all_fee_structures(db=self.db, current_user=actor(role), active_session=self.db.get(AcademicSession, 1))
            self.assertEqual(len(response), 1)
        self.assert_http(403, fee_structure.get_all_fee_structures, db=self.db, current_user=actor("teacher"), active_session=None)

    def test_teacher_cannot_grant_discount_during_creation_but_can_enroll_without_one(self):
        fields = dict(first_name="New", last_name="Student", classroom_id=1, session_id=1, enrollment_date=date(2026, 1, 1))
        self.assert_http(403, students.create_student_with_enrollment,
                         StudentWithEnrollmentCreate(**fields, discount_percent=10), db=self.db, current_user=actor("teacher"))
        self.assertEqual(self.db.query(Student).count(), 2)
        student = students.create_student_with_enrollment(StudentWithEnrollmentCreate(**fields), db=self.db, current_user=actor("teacher"))
        self.assertEqual(self.db.query(StudentEnrollment).filter_by(student_id=student.id).one().discount_percent, Decimal("0"))

    def test_manager_can_create_approved_discount(self):
        student = students.create_student_with_enrollment(
            StudentWithEnrollmentCreate(first_name="Approved", last_name="Student", classroom_id=1, session_id=1,
                                        enrollment_date=date(2026, 1, 1), discount_percent="12.50"),
            db=self.db, current_user=actor("manager"))
        self.assertEqual(self.db.query(StudentEnrollment).filter_by(student_id=student.id).one().discount_percent, Decimal("12.50"))

    def test_existing_student_enrollment_enforces_discount_permission_and_commits(self):
        kwargs = dict(student_id=1, classroom_id=1, session_id=1, enrollment_date=date(2026, 1, 1),
                      roll_number="007", discount_percent=Decimal("10"), db=self.db)
        self.assert_http(403, students.enroll_student, current_user=actor("teacher"), **kwargs)
        enrollment = students.enroll_student(current_user=actor("admin"), **kwargs)
        self.assertEqual(enrollment.discount_percent, Decimal("10"))
        self.assertEqual(enrollment.roll_number, "007")
        self.db.rollback()
        self.assertEqual(self.db.query(StudentEnrollment).count(), 1)
        self.assert_http(409, students.enroll_student, current_user=actor("admin"), **kwargs)
        self.assert_http(409, students.enroll_student, current_user=actor("teacher"),
                         **{**kwargs, "discount_percent": Decimal("0")})
        self.assertEqual(self.db.query(StudentEnrollment).one().discount_percent, Decimal("10"))

    def test_student_profile_update_cannot_override_approved_discount(self):
        self.db.add(StudentEnrollment(student_id=1, classroom_id=1, session_id=1, discount_percent="12.50"))
        self.db.commit()
        students.update_student(1, StudentUpdate(first_name="Updated", discount_percent=100),
                                db=self.db, current_user=actor("teacher"))
        self.assertEqual(self.db.get(Student, 1).first_name, "Updated")
        self.assertEqual(self.db.query(StudentEnrollment).one().discount_percent, Decimal("12.50"))

    def test_existing_enrollment_rejects_foreign_session_even_if_class_is_owned(self):
        self.assert_http(400, students.enroll_student, student_id=1, classroom_id=5, session_id=3,
                         enrollment_date=date(2026, 1, 1), roll_number=None, discount_percent=Decimal("0"),
                         db=self.db, current_user=actor())
        self.assertEqual(self.db.query(StudentEnrollment).count(), 0)

    def test_crud_enrollment_rejects_invalid_discounts_without_writing(self):
        for value in [-1, 101, True, "NaN", "1.001"]:
            self.assert_http(422, student_crud.enroll_student, db=self.db, student_id=1, classroom_id=1,
                             session_id=1, enrollment_date=date(2026, 1, 1), discount_percent=value)
        self.assertEqual(self.db.query(StudentEnrollment).count(), 0)

    def test_student_deletion_preserves_fees_and_transactions(self):
        self.add_fee_history()
        self.assert_http(409, students.delete_student, 1, db=self.db, current_user=actor())
        self.assertIsNotNone(self.db.get(Student, 1))
        self.assertEqual(self.db.query(StudentFee).count(), 1)
        self.assertEqual(self.db.query(FeeTransaction).count(), 1)
        self.assertEqual(self.db.query(StudentFee).one().paid_amount, Decimal("10"))

    def test_direct_orm_student_delete_cannot_cascade_financial_history(self):
        self.add_fee_history()
        student = self.db.get(Student, 1)
        self.assertEqual(len(student.fees), 1)  # Loaded relationships must also be safe.
        self.db.delete(student)
        with self.assertRaises(IntegrityError):
            self.db.commit()
        self.db.rollback()
        self.assertEqual(self.db.query(FeeTransaction).count(), 1)
        self.assertEqual(self.db.query(StudentFee).count(), 1)

    def test_student_without_fee_history_can_be_deleted_and_tenant_guard_remains(self):
        self.db.add(StudentEnrollment(student_id=1, session_id=1, classroom_id=1, enrollment_date=date(2026, 1, 1)))
        self.db.commit()
        self.assert_http(404, students.delete_student, 2, db=self.db, current_user=actor())
        students.delete_student(1, db=self.db, current_user=actor())
        self.assertIsNone(self.db.get(Student, 1))
        self.assertEqual(self.db.query(StudentEnrollment).count(), 0)
        self.assertIsNotNone(self.db.get(Student, 2))

    def test_dashboard_cache_hit_cannot_leak_financial_amounts(self):
        self.db.add(OrganizationMember(organization_id=1, user_id=1, role="teacher"))
        self.db.commit()
        with patch.object(dashboard.redis_client, "get", return_value='{"financials":{"year":2026,"revenue":{"yearTotal":999},"monthlyComparison":[]}}') as get:
            result = dashboard.get_dashboard_stats(db=self.db, current_user=actor("teacher"), active_session=self.db.get(AcademicSession, 1))
        self.assertEqual(result["financials"]["revenue"]["yearTotal"], 0)
        get.assert_called_once_with("dashboard:stats:1:1:teacher")


if __name__ == "__main__":
    unittest.main()
