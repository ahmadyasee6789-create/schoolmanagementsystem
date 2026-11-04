"""Phase 1 application regressions using only synthetic SQLite or loopback PostgreSQL data."""
import os
import unittest
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

import app.models
from app.db.base import Base
from app.models.academic_session import AcademicSession
from app.models.classroom import Classroom, Grade
from app.models.fee_structure import FeeStructure
from app.models.fee_transection import FeeTransaction
from app.models.student_enrollment import StudentEnrollment
from app.models.student_fee import StudentFee
from app.models.students import Student
from app.models.users import Organization, User
from app.schemas.student_fee import PaymentCreate
from app.services.fee_collection import collect_fee_payment, money

with patch.dict(os.environ, {"DATABASE_URL": "sqlite://"}):
    from app.routers import student_fee as routes


class PaymentValidationTests(unittest.TestCase):
    def test_rejects_invalid_financial_amounts(self):
        for amount in (None, True, False, 0, -1, "NaN", "Infinity", "-Infinity", "1.001", "1000000000000"):
            with self.subTest(amount=amount), self.assertRaises(ValidationError):
                PaymentCreate(amount=amount)

    def test_accepts_exact_cents_and_legacy_integer_inputs(self):
        self.assertEqual(PaymentCreate(amount=12).amount, Decimal("12"))
        self.assertEqual(PaymentCreate(amount="12.35").amount, Decimal("12.35"))
        self.assertEqual(PaymentCreate(amount=12.35).amount, Decimal("12.35"))

    def test_stored_money_guard_rejects_inconsistent_precision(self):
        for value in (True, None, "NaN", "Infinity", -1, "0.001", "1000000000000"):
            with self.subTest(value=value), self.assertRaises(HTTPException) as failed:
                money(value)
            self.assertEqual(failed.exception.status_code, 409)


class FeeIntegrityTests(unittest.TestCase):
    def setUp(self):
        if os.environ.get("TEST_POSTGRES_URL"):
            from test_fee_postgres import isolated_postgres_engine
            self.engine = isolated_postgres_engine(self)
        else:
            self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
            event.listen(self.engine, "connect", lambda connection, _: connection.execute("PRAGMA foreign_keys=ON"))
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.db.close)
        self.actor = SimpleNamespace(id=1, org_id=1, org_role="accountant")
        self.db.add_all([Organization(id=1, name="Synthetic School"), Organization(id=2, name="Other School"),
                         User(id=1, full_name="Synthetic Accountant", email="phase1@example.invalid")])
        self.db.flush()
        self.db.add_all([
            AcademicSession(id=1, organization_id=1, name="2026-27", is_active=True, start_date=date(2026, 4, 1), end_date=date(2027, 3, 31)),
            AcademicSession(id=2, organization_id=2, name="2026-27", is_active=True, start_date=date(2026, 4, 1), end_date=date(2027, 3, 31)),
            Grade(id=1, organization_id=1, name="Test Grade"),
            Student(id=1, organization_id=1, first_name="Synthetic", admission_no="TEST-001"),
        ])
        self.db.flush()
        self.db.add(Classroom(id=1, organization_id=1, grade_id=1, section="A", academic_year_id=1))
        self.db.flush()
        self.db.add_all([
            StudentEnrollment(student_id=1, classroom_id=1, session_id=1, is_active=True, enrollment_date=date(2026, 4, 1), discount_percent=Decimal("12.50")),
            FeeStructure(organization_id=1, class_id=1, session_id=1, admission_fee=Decimal("0.00"), monthly_fee=Decimal("1000.04"), exam_fee=Decimal("0.00"), rates_finalized=True),
            StudentFee(id=1, organization_id=1, student_id=1, class_id=1, session_id=1, month="April", billing_period=date(2026, 4, 1),
                       monthly_fee=Decimal("1000.00"), total_amount=Decimal("1000.00"), final_amount=Decimal("1000.00")),
        ])
        self.db.commit()
        if self.engine.dialect.name == "postgresql":
            self.db.execute(text("SELECT setval(pg_get_serial_sequence('student_fees', 'id'), (SELECT max(id) FROM student_fees))"))
            self.db.commit()
        self.session = self.db.get(AcademicSession, 1)

    def pay(self, amount="250.25", key="test-payment-key", fee_id=1):
        return collect_fee_payment(self.db, self.actor, fee_id, Decimal(amount), key)

    def generate(self, month="May", actor=None, session=None, class_id=1):
        return routes.generate_monthly_fees(class_id, month, False, self.db, actor or self.actor, session or self.session)

    def assert_payment_error(self, code, **kwargs):
        with self.assertRaises(HTTPException) as failure:
            self.pay(**kwargs)
        self.assertEqual(failure.exception.status_code, code)

    def test_same_key_replays_exact_response_and_never_duplicates(self):
        first = self.pay()
        self.assertEqual(first, self.pay())
        self.assertEqual(self.db.query(FeeTransaction).count(), 1)
        self.assertEqual(self.db.get(StudentFee, 1).paid_amount, Decimal("250.25"))

    def test_key_conflict_does_not_mutate_balance(self):
        self.pay()
        self.assert_payment_error(409, amount="300.00")
        self.assertEqual(self.db.get(StudentFee, 1).paid_amount, Decimal("250.25"))

    def test_replay_keeps_original_snapshot_after_later_payment(self):
        first = self.pay()
        self.pay("100.00", "another-payment")
        self.assertEqual(first, self.pay())
        self.assertEqual(self.db.get(StudentFee, 1).paid_amount, Decimal("350.25"))

    def test_bad_keys_are_rejected_without_writes(self):
        for key in (None, "", "short", "a" * 129, "invalid key", "non-ascii-\u00e9"):
            with self.subTest(key=key):
                self.assert_payment_error(422, key=key)
        self.assertEqual(self.db.query(FeeTransaction).count(), 0)

    def test_collection_cannot_overpay(self):
        self.pay("750.00")
        self.assert_payment_error(400, amount="250.01", key="overpayment-key")
        self.assertEqual(self.db.get(StudentFee, 1).paid_amount, Decimal("750.00"))

    def test_collection_accepts_exact_remaining_balance(self):
        self.pay("250.25")
        result = self.pay("749.75", "final-payment-key")
        self.assertEqual(result["status"], "paid")
        self.assertEqual(result["paid_amount"], 1000)

    def test_collect_roles_and_cross_tenant_reads_are_denied(self):
        for role in ("teacher", "student", "parent", None, "unknown"):
            self.actor.org_role = role
            self.assert_payment_error(403)
        self.actor.org_role = "accountant"
        self.actor.org_id = 2
        self.assert_payment_error(404)
        self.assertEqual(self.db.query(FeeTransaction).count(), 0)

    def test_legacy_paid_balance_must_reconcile_before_collection(self):
        self.db.get(StudentFee, 1).paid_amount = Decimal("100.00")
        self.db.commit()
        self.assert_payment_error(409)
        self.assertEqual(self.db.query(FeeTransaction).count(), 0)

    def test_legacy_bad_breakdown_rejected_even_before_database_migration(self):
        if self.engine.dialect.name == "postgresql":
            self.skipTest("Legacy corruption fixture uses SQLite constraint bypass")
        self.db.execute(text("PRAGMA ignore_check_constraints=ON"))
        self.db.get(StudentFee, 1).final_amount = Decimal("999.00")
        self.db.commit()
        self.db.execute(text("PRAGMA ignore_check_constraints=OFF"))
        self.assert_payment_error(409)

    def test_collection_does_not_render_pdf(self):
        with patch.object(routes, "render_fee_receipt", side_effect=RuntimeError("PDF unavailable")) as render:
            result = routes.collect_payment(1, PaymentCreate(amount="250.25"), self.db, self.actor, "receipt-failure-test")
        render.assert_not_called()
        self.assertIsNone(result["receipt_pdf"])
        self.assertEqual(result["receipt_url"], f'/fees/payments/{result["transaction_id"]}/receipt')
        self.assertEqual(self.db.query(FeeTransaction).count(), 1)

    def test_pdf_failure_does_not_change_payment_and_can_be_retried(self):
        payment = self.pay()
        with patch.object(routes, "render_fee_receipt", side_effect=RuntimeError("Renderer unavailable")):
            with self.assertRaises(HTTPException) as failed:
                routes.download_payment_receipt(payment["transaction_id"], self.db, self.actor)
            self.assertEqual(failed.exception.status_code, 503)
        self.assertEqual(self.db.query(FeeTransaction).count(), 1)
        self.assertEqual(self.db.get(StudentFee, 1).paid_amount, Decimal("250.25"))
        receipt = routes.download_payment_receipt(payment["transaction_id"], self.db, self.actor)
        self.assertTrue(receipt.body.startswith(b"%PDF"))
        self.assertEqual(receipt.headers["cache-control"], "private, no-store")

    def test_receipt_requires_finance_role_and_matching_tenant(self):
        payment = self.pay()
        for actor, expected in ((SimpleNamespace(org_id=1, org_role="teacher"), 403),
                                (SimpleNamespace(org_id=2, org_role="accountant"), 404)):
            with self.assertRaises(HTTPException) as failed:
                routes.download_payment_receipt(payment["transaction_id"], self.db, actor)
            self.assertEqual(failed.exception.status_code, expected)

    def test_generation_rounds_once_and_is_idempotent(self):
        self.assertIn("1 fees", self.generate()["message"])
        self.assertIn("0 fees", self.generate()["message"])
        fee = self.db.query(StudentFee).filter_by(month="May").one()
        self.assertEqual(fee.discount_amount, Decimal("125.01"))
        self.assertEqual(fee.final_amount, Decimal("875.03"))
        self.assertEqual(fee.monthly_fee, Decimal("1000.04"))

    def test_zero_net_generation_has_paid_status(self):
        enrollment = self.db.query(StudentEnrollment).one()
        enrollment.discount_percent = Decimal("100.00")
        self.db.commit()
        self.generate()
        fee = self.db.query(StudentFee).filter_by(month="May").one()
        self.assertEqual(fee.final_amount, 0)
        self.assertEqual(fee.status, "paid")

    def test_generation_rejects_foreign_session(self):
        with self.assertRaises(HTTPException) as failed:
            self.generate(session=self.db.get(AcademicSession, 2))
        self.assertEqual(failed.exception.status_code, 404)
        self.assertEqual(self.db.query(StudentFee).count(), 1)

    def test_generation_and_ledger_reject_nonfinance_roles(self):
        actor = SimpleNamespace(id=1, org_id=1, org_role="teacher")
        with self.assertRaises(HTTPException) as generation:
            self.generate(actor=actor)
        self.assertEqual(generation.exception.status_code, 403)
        with self.assertRaises(HTTPException) as ledger:
            routes.get_fee_ledger(1, "April", 1, 10, self.db, actor, self.session)
        self.assertEqual(ledger.exception.status_code, 403)

    def test_generation_rejects_legacy_invalid_discount_atomically(self):
        if self.engine.dialect.name == "postgresql":
            self.skipTest("Legacy corruption fixture uses SQLite constraint bypass")
        self.db.execute(text("PRAGMA ignore_check_constraints=ON"))
        self.db.query(StudentEnrollment).one().discount_percent = Decimal("101.00")
        self.db.commit()
        self.db.execute(text("PRAGMA ignore_check_constraints=OFF"))
        with self.assertRaises(HTTPException) as failed:
            self.generate()
        self.assertEqual(failed.exception.status_code, 409)
        self.assertEqual(self.db.query(StudentFee).count(), 1)

    def test_database_restricts_student_and_fee_history_deletion(self):
        self.pay()
        for entity in (self.db.get(Student, 1), self.db.get(StudentFee, 1)):
            with self.subTest(entity=type(entity).__name__), self.assertRaises(IntegrityError):
                self.db.delete(entity)
                self.db.commit()
            self.db.rollback()
        self.assertEqual(self.db.query(FeeTransaction).count(), 1)
        self.assertEqual(self.db.query(StudentFee).count(), 1)
        self.assertEqual(self.db.query(Student).count(), 1)


    def test_http_requires_key_and_preserves_numeric_response(self):
        app = FastAPI()
        app.include_router(routes.router)
        app.dependency_overrides[routes.get_db] = lambda: self.db
        app.dependency_overrides[routes.get_current_user] = lambda: self.actor
        with TestClient(app) as client:
            missing = client.post("/fees/1/collect", json={"amount": 100})
            self.assertEqual(missing.status_code, 422)
            self.assertEqual(self.db.query(FeeTransaction).count(), 0)
            headers = {"Idempotency-Key": "http-payment-key"}
            result = client.post("/fees/1/collect", json={"amount": "100.25"}, headers=headers)
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(result.json()["paid_amount"], 100.25)
            self.assertEqual(client.post("/fees/1/collect", json={"amount": 100.25}, headers=headers).json(), result.json())


if __name__ == "__main__":
    unittest.main()
