"""Confirmed enrollment edits using synthetic SQLite or disposable PostgreSQL."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from decimal import Decimal
import os
from threading import Barrier
import unittest
from unittest.mock import patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import test_fee_integrity as fixture
from app.crud.student import update_student
from app.models.academic_session import AcademicSession
from app.models.classroom import Classroom
from app.models.fee_allocation import FeeAllocation
from app.models.fee_transection import FeeTransaction
from app.models.student_enrollment import StudentEnrollment
from app.models.student_fee import StudentFee
from app.models.students import Student
from app.routers import students
from app.schemas.student import StudentUpdate
from app.services.fee_allocations import remaining_credit
from app.services.fee_collection import collect_fee_payment
from app.services.monthly_fees import get_or_create_monthly_fee


class EnrollmentDiscountEditTests(unittest.TestCase):
    def setUp(self):
        fixture.FeeIntegrityTests.setUp(self)
        self.actor.org_role = "admin"
        self.enrollment = self.db.query(StudentEnrollment).filter_by(student_id=1, session_id=1).one()
        self.enrollment.discount_percent = Decimal("0")
        self.db.add(AcademicSession(id=3, organization_id=1, name="Earlier session", is_active=False,
                                   start_date=date(2025, 4, 1), end_date=date(2026, 3, 31)))
        self.db.flush()
        self.db.add(StudentEnrollment(student_id=1, session_id=3, discount_percent=Decimal("42"),
                                      enrollment_date=date(2025, 4, 1), is_active=False))
        self.db.commit()
        app = FastAPI()
        app.include_router(students.router)
        app.dependency_overrides[students.get_db] = lambda: self.db
        app.dependency_overrides[students.get_current_user] = lambda: self.actor
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def payload(self, percent="10", expected="0", **overrides):
        return dict(enrollment_id=self.enrollment.id, session_id=1, discount_percent=percent,
                    expected_discount_percent=expected, confirmed=True, **overrides)

    def change(self, percent="10", expected="0", **personal):
        return self.client.put("/students/1", json={**personal, "enrollment_discount": self.payload(percent, expected)})

    def stored_discount(self):
        self.db.refresh(self.enrollment)
        return self.enrollment.discount_percent

    def test_personal_edit_without_discount_keeps_actual_enrollment(self):
        self.enrollment.discount_percent = Decimal("12.50")
        self.db.commit()
        self.actor.org_role = "teacher"
        response = self.client.put("/students/1", json={"first_name": "Updated"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.stored_discount(), Decimal("12.50"))
        self.assertEqual(self.db.get(Student, 1).first_name, "Updated")

    def test_zero_to_ten_with_profile_changes(self):
        response = self.change(first_name="Updated")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.stored_discount(), Decimal("10.00"))
        self.assertEqual(self.db.get(Student, 1).first_name, "Updated")

    def test_ten_to_five(self):
        self.enrollment.discount_percent = Decimal("10")
        self.db.commit()
        self.assertEqual(self.change("5", "10").status_code, 200)
        self.assertEqual(self.stored_discount(), Decimal("5.00"))

    def test_ten_to_zero(self):
        self.enrollment.discount_percent = Decimal("10")
        self.db.commit()
        self.assertEqual(self.change("0", "10").status_code, 200)
        self.assertEqual(self.stored_discount(), Decimal("0.00"))

    def test_percentage_bounds_and_decimal_precision(self):
        for field in ("discount_percent", "expected_discount_percent"):
            for value in (-1, 101, "0.001", "NaN", "Infinity", True, False, None, ""):
                with self.subTest(field=field, value=value):
                    data = self.payload()
                    data[field] = value
                    response = self.client.put("/students/1", json={"first_name": "Forbidden", "enrollment_discount": data})
                    self.assertEqual(response.status_code, 422, response.text)
                    self.assertEqual(self.stored_discount(), Decimal("0"))
                    self.assertEqual(self.db.get(Student, 1).first_name, "Synthetic")
        self.assertEqual(self.change("100").status_code, 200)
        self.assertEqual(self.stored_discount(), Decimal("100.00"))

    def test_explicit_confirmation_and_allowlisted_fields_are_required(self):
        for invalid in ({"confirmed": False}, {"organization_id": 2}, {"yearly_discount_percent": 10}):
            data = {**self.payload(), **invalid}
            self.assertEqual(self.client.put("/students/1", json={"enrollment_discount": data}).status_code, 422)
        data = self.payload()
        del data["confirmed"]
        self.assertEqual(self.client.put("/students/1", json={"enrollment_discount": data}).status_code, 422)
        self.assertEqual(self.stored_discount(), Decimal("0"))

    def test_only_administrators_can_submit_discount_changes_even_to_zero(self):
        for role in ("teacher", "manager", "accountant", "viewer", None):
            for value in ("0", "10"):
                with self.subTest(role=role, value=value):
                    self.actor.org_role = role
                    response = self.change(value, first_name="Forbidden")
                    self.assertEqual(response.status_code, 403, response.text)
                    self.assertEqual(self.stored_discount(), Decimal("0"))
                    self.assertEqual(self.db.get(Student, 1).first_name, "Synthetic")

    def test_exact_enrollment_session_and_organization_are_checked(self):
        other = self.db.query(StudentEnrollment).filter_by(student_id=1, session_id=3).one()
        for enrollment_id, session_id in ((self.enrollment.id, 2), (self.enrollment.id, 3), (other.id, 1), (999, 1)):
            with self.subTest(enrollment_id=enrollment_id, session_id=session_id):
                data = {**self.payload(), "enrollment_id": enrollment_id, "session_id": session_id}
                response = self.client.put("/students/1", json={"first_name": "Forbidden", "enrollment_discount": data})
                self.assertEqual(response.status_code, 404, response.text)
                self.assertEqual(self.stored_discount(), Decimal("0"))
        self.actor.org_id = 2
        self.assertEqual(self.change().status_code, 404)
        self.assertEqual(self.stored_discount(), Decimal("0"))

    def test_selected_session_does_not_fall_back_to_active_enrollment(self):
        other = self.db.query(StudentEnrollment).filter_by(student_id=1, session_id=3).one()
        data = {**self.payload("5", "42"), "enrollment_id": other.id, "session_id": 3}
        response = self.client.put("/students/1", json={"enrollment_discount": data})
        self.assertEqual(response.status_code, 200, response.text)
        self.db.refresh(other)
        self.assertEqual(other.discount_percent, Decimal("5"))
        self.assertEqual(self.stored_discount(), Decimal("0"))

    def test_enrollment_classroom_must_match_school_and_session(self):
        classroom = self.db.get(Classroom, 1)
        for field, value in (("organization_id", 2), ("academic_year_id", 3)):
            with self.subTest(field=field):
                original = getattr(classroom, field)
                setattr(classroom, field, value)
                self.db.commit()
                response = self.change(first_name="Forbidden")
                self.assertEqual(response.status_code, 409, response.text)
                self.assertEqual(self.stored_discount(), Decimal("0"))
                self.assertEqual(self.db.get(Student, 1).first_name, "Synthetic")
                setattr(classroom, field, original)
                self.db.commit()

    def test_stale_confirmation_rejects_the_entire_save(self):
        self.assertEqual(self.change().status_code, 200)
        response = self.change("5", "0", first_name="Forbidden")
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(self.stored_discount(), Decimal("10"))
        self.assertEqual(self.db.get(Student, 1).first_name, "Synthetic")

    def test_failed_commit_rolls_back_profile_and_discount(self):
        with patch.object(self.db, "commit", side_effect=RuntimeError("Synthetic failure")):
            with self.assertRaisesRegex(RuntimeError, "Synthetic failure"):
                self.change(first_name="Forbidden")
        self.assertEqual(self.stored_discount(), Decimal("0"))
        self.assertEqual(self.db.get(Student, 1).first_name, "Synthetic")

    def generate(self, period):
        fee, created = get_or_create_monthly_fee(self.db, org_id=1, student_id=1, session_id=1, period=period)
        self.db.commit()
        return fee, created

    def test_existing_paid_partial_future_fees_payments_allocations_and_credit_are_unchanged(self):
        partial, _ = self.generate(date(2026, 5, 1))
        future, _ = self.generate(date(2027, 2, 1))
        collect_fee_payment(self.db, self.actor, 1, Decimal("1000"), "discount-test-paid")
        collect_fee_payment(self.db, self.actor, partial.id, Decimal("250.25"), "discount-test-partial")
        credit = FeeTransaction(organization_id=1, student_id=1, session_id=1, amount=Decimal("500"),
                                receipt_no="SYNTHETIC-ADVANCE", created_by=1)
        self.db.add(credit)
        self.db.commit()
        def records(model):
            return [{column.name: getattr(row, column.name) for column in model.__table__.columns}
                    for row in self.db.query(model).order_by(model.id)]
        before = {model: records(model) for model in (StudentFee, FeeTransaction, FeeAllocation)}
        self.assertEqual(remaining_credit(self.db, credit), Decimal("500"))
        self.assertEqual(self.change().status_code, 200)
        for model, values in before.items():
            self.assertEqual(records(model), values)
        self.assertEqual(remaining_credit(self.db, credit), Decimal("500"))
        existing, created = self.generate(date(2027, 2, 1))
        self.assertFalse(created)
        self.assertEqual(existing.id, future.id)
        self.assertEqual(existing.discount_percent, Decimal("0"))

    def test_new_future_tuition_uses_the_updated_precise_discount(self):
        self.assertEqual(self.change("10").status_code, 200)
        fee, created = self.generate(date(2026, 12, 1))
        self.assertTrue(created)
        self.assertEqual(fee.discount_percent, Decimal("10.00"))
        self.assertEqual(fee.monthly_fee, Decimal("1000.04"))
        self.assertEqual(fee.discount_amount, Decimal("100.00"))
        self.assertEqual(fee.final_amount, Decimal("900.04"))
        self.assertEqual(self.change("5", "10").status_code, 200)
        next_fee, _ = self.generate(date(2027, 1, 1))
        self.assertEqual(next_fee.discount_percent, Decimal("5.00"))
        self.assertEqual(next_fee.final_amount, Decimal("950.04"))

    @unittest.skipUnless(os.environ.get("TEST_POSTGRES_URL"), "Requires disposable PostgreSQL")
    def test_concurrent_confirmations_cannot_overwrite_a_newer_discount(self):
        requests = [StudentUpdate(enrollment_discount=self.payload(value)) for value in ("5", "10")]
        self.db.rollback()
        barrier = Barrier(2)
        def save(request):
            with Session(self.engine) as db:
                barrier.wait(timeout=10)
                try:
                    update_student(db, 1, request, 1)
                    return 200
                except HTTPException as exc:
                    return exc.status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            statuses = list(pool.map(save, requests))
        self.assertEqual(sorted(statuses), [200, 409])
        self.assertIn(self.stored_discount(), (Decimal("5"), Decimal("10")))
