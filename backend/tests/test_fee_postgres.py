"""Financial integrity against a real, explicitly selected local PostgreSQL server.

Run with TEST_POSTGRES_URL pointing at a disposable database whose name starts
with sms_fee_test_. Only literal loopback addresses are accepted. Every test gets
a separate temporary schema. DATABASE_URL and .env are deliberately never read.

The Windows helper run_postgres_tests.ps1 creates and stops a separate local
PostgreSQL cluster using the installed binaries; it never uses Supabase.
"""
import os
import threading
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import create_engine, event, func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

import app.models  # Register all SQLAlchemy relationship targets.
from app.db.base import Base
from app.models.academic_session import AcademicSession
from app.models.classroom import Classroom, Grade
from app.models.fee_transection import FeeTransaction
from app.models.student_fee import StudentFee
from app.models.students import Student
from app.models.users import Organization, User


def validated_test_url(raw):
    """Fail closed, including libpq query parameters that could override host."""
    url = make_url(raw)
    if (
        url.drivername not in {"postgresql", "postgresql+psycopg2"}
        or url.host not in {"127.0.0.1", "::1"}
        or not url.database
        or not url.database.startswith("sms_fee_test_")
        or url.query
    ):
        raise ValueError(
            "TEST_POSTGRES_URL must use psycopg2, a literal loopback host, "
            "an sms_fee_test_ database, and no connection query parameters"
        )
    return url


class PostgreSQLTargetSafetyTests(unittest.TestCase):
    def test_refuses_remote_or_ambiguous_targets(self):
        for raw in (
            "postgresql://user@db.example.com/sms_fee_test_db",
            "postgresql://user@localhost/sms_fee_test_db",
            "postgresql://user@127.0.0.1/production",
            "postgresql://user@127.0.0.1/sms_fee_test_db?host=db.example.com",
            "postgresql://user@/sms_fee_test_db",
            "sqlite://",
        ):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                validated_test_url(raw)

    def test_accepts_explicit_disposable_loopback_database(self):
        self.assertEqual(
            validated_test_url("postgresql+psycopg2://user@127.0.0.1:55439/sms_fee_test_run").host,
            "127.0.0.1",
        )


@unittest.skipUnless(os.environ.get("TEST_POSTGRES_URL"), "Set TEST_POSTGRES_URL to an explicit disposable local PostgreSQL database")
class PostgreSQLFeeCollectionTests(unittest.TestCase):
    def setUp(self):
        # Keep service imports inside the explicitly enabled test fixture. Do not
        # import the application database bootstrap or its dotenv configuration.
        from app.services.fee_collection import collect_fee_payment

        self.collect = collect_fee_payment
        self.url = validated_test_url(os.environ["TEST_POSTGRES_URL"])
        self.schema = "fee_integrity_" + uuid.uuid4().hex
        self.admin_engine = create_engine(self.url, connect_args={"connect_timeout": 5})
        self.addCleanup(self.admin_engine.dispose)
        with self.admin_engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{self.schema}"'))
        self.addCleanup(self.drop_schema)
        self.engine = create_engine(
            self.url,
            connect_args={
                "connect_timeout": 5,
                "options": f"-c search_path={self.schema} -c statement_timeout=15000 -c lock_timeout=10000",
            },
            pool_size=4,
            max_overflow=0,
        )
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(self.engine)
        self.actor = SimpleNamespace(id=1, org_id=1, org_role="accountant")
        with Session(self.engine) as db:
            db.add(Organization(id=1, name="Concurrency Test School"))
            db.add(User(id=1, full_name="Synthetic Accountant", email="accountant@example.invalid", is_active=True))
            db.flush()
            db.add_all([
                AcademicSession(id=1, organization_id=1, name="2026-27", start_date=date(2026, 4, 1), end_date=date(2027, 3, 31)),
                Grade(id=1, organization_id=1, name="Grade Test"),
                Student(id=1, organization_id=1, admission_no="SYNTHETIC-001", first_name="Synthetic"),
            ])
            db.flush()
            db.add(Classroom(id=1, organization_id=1, grade_id=1, section="A", academic_year_id=1))
            db.flush()
            for fee_id, month in ((1, "April"), (2, "May")):
                db.add(StudentFee(
                    id=fee_id, student_id=1, organization_id=1, class_id=1, session_id=1, month=month,
                    admission_fee=Decimal("0.00"), monthly_fee=Decimal("1000.00"), exam_fee=Decimal("0.00"),
                    total_amount=Decimal("1000.00"), discount_percent=Decimal("0.00"),
                    discount_amount=Decimal("0.00"), final_amount=Decimal("1000.00"),
                    paid_amount=Decimal("0.00"), status="unpaid",
                ))
            db.commit()

    def drop_schema(self):
        # The schema name is generated here, never supplied by the caller.
        with self.admin_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{self.schema}" CASCADE'))

    def payment(self, fee_id, amount, key, barrier=None):
        with Session(self.engine) as db:
            # Both transactions deliberately cache the old amount before the
            # barrier. A SELECT FOR UPDATE must refresh this cached object.
            cached_fee = db.get(StudentFee, fee_id)
            self.assertIsNotNone(cached_fee)
            if barrier is not None:
                barrier.wait(timeout=10)
            try:
                return self.collect(db, self.actor, fee_id, Decimal(amount), key)
            except HTTPException as exc:
                db.rollback()
                return exc

    def race(self, *requests):
        barrier = threading.Barrier(len(requests))
        with ThreadPoolExecutor(max_workers=len(requests)) as executor:
            futures = [executor.submit(self.payment, *request, barrier=barrier) for request in requests]
            return [future.result(timeout=25) for future in futures]

    def assert_reconciled(self, amount, count, fee_id=1):
        with Session(self.engine) as db:
            fee = db.get(StudentFee, fee_id)
            total, actual_count = db.execute(select(
                func.coalesce(func.sum(FeeTransaction.amount), 0), func.count(FeeTransaction.id)
            ).where(FeeTransaction.student_fee_id == fee_id)).one()
            self.assertEqual(fee.paid_amount, Decimal(amount))
            self.assertEqual(total, Decimal(amount))
            self.assertEqual(actual_count, count)
            self.assertEqual(fee.status, "paid" if Decimal(amount) == fee.final_amount else "partial" if Decimal(amount) else "unpaid")

    def test_simultaneous_same_key_records_one_collection(self):
        results = self.race((1, "250.50", "same-request"), (1, "250.50", "same-request"))
        self.assertTrue(all(isinstance(result, dict) for result in results), results)
        self.assertEqual(results[0]["receipt_no"], results[1]["receipt_no"])
        self.assert_reconciled("250.50", 1)

    def test_simultaneous_same_key_different_amount_conflicts(self):
        results = self.race((1, "200.00", "conflicting-request"), (1, "300.00", "conflicting-request"))
        successes = [value for value in results if isinstance(value, dict)]
        failures = [value for value in results if isinstance(value, HTTPException)]
        self.assertEqual(len(successes), 1, results)
        self.assertEqual([value.status_code for value in failures], [409])
        with Session(self.engine) as db:
            amount = db.scalar(select(FeeTransaction.amount))
        self.assert_reconciled(str(amount), 1)

    def test_same_key_cannot_move_to_a_different_fee(self):
        results = self.race((1, "250.00", "fee-conflict"), (2, "250.00", "fee-conflict"))
        self.assertEqual(sum(isinstance(result, dict) for result in results), 1)
        self.assertEqual([result.status_code for result in results if isinstance(result, HTTPException)], [409])
        with Session(self.engine) as db:
            self.assertEqual(db.scalar(select(func.count(FeeTransaction.id))), 1)

    def test_distinct_concurrent_partial_payments_refresh_cached_balance(self):
        results = self.race((1, "200.25", "partial-one"), (1, "300.50", "partial-two"))
        self.assertTrue(all(isinstance(result, dict) for result in results), results)
        self.assert_reconciled("500.75", 2)

    def test_overpayment_race_only_one_collection_commits(self):
        results = self.race((1, "600.00", "overpay-one"), (1, "600.00", "overpay-two"))
        self.assertEqual(sum(isinstance(result, dict) for result in results), 1)
        self.assertEqual([result.status_code for result in results if isinstance(result, HTTPException)], [400])
        self.assert_reconciled("600.00", 1)

    def test_concurrent_different_fees_get_unique_receipts(self):
        results = self.race((1, "250.00", "receipt-one"), (2, "300.00", "receipt-two"))
        self.assertTrue(all(isinstance(result, dict) for result in results), results)
        self.assertNotEqual(results[0]["receipt_no"], results[1]["receipt_no"])
        self.assert_reconciled("250.00", 1, fee_id=1)
        self.assert_reconciled("300.00", 1, fee_id=2)

    def test_replay_returns_original_balance_snapshot_after_later_payment(self):
        first = self.payment(1, "200.00", "first-snapshot")
        self.payment(1, "300.00", "later-payment")
        replay = self.payment(1, "200.00", "first-snapshot")
        self.assertEqual(first["receipt_no"], replay["receipt_no"])
        self.assertEqual(first["paid_amount"], replay["paid_amount"])
        self.assertEqual(first["status"], replay["status"])
        self.assert_reconciled("500.00", 2)

    def test_database_insert_failure_rolls_back_balance_and_transaction(self):
        def reject_payment_insert(connection, cursor, statement, parameters, context, executemany):
            if statement.lstrip().upper().startswith("INSERT INTO FEE_TRANSACTIONS"):
                raise SQLAlchemyError("Synthetic insert failure")

        event.listen(self.engine, "before_cursor_execute", reject_payment_insert)
        try:
            with Session(self.engine) as db:
                with self.assertRaises(HTTPException) as failed:
                    self.collect(db, self.actor, 1, Decimal("250.00"), "failed-insert")
                self.assertEqual(failed.exception.status_code, 503)
                self.assertFalse(db.in_transaction(), "The collection service must roll back before returning failure")
        finally:
            event.remove(self.engine, "before_cursor_execute", reject_payment_insert)
        self.assert_reconciled("0.00", 0)
        # A failed request must not consume the key or prevent a valid retry.
        self.assertIsInstance(self.payment(1, "250.00", "failed-insert"), dict)
        self.assert_reconciled("250.00", 1)

    def test_database_unique_constraint_rejects_duplicate_period(self):
        with Session(self.engine) as db:
            db.add(StudentFee(
                id=3, student_id=1, organization_id=1, class_id=1, session_id=1, month="April",
                total_amount=Decimal("1000.00"), monthly_fee=Decimal("1000.00"),
                final_amount=Decimal("1000.00"),
            ))
            with self.assertRaises(IntegrityError):
                db.commit()
            db.rollback()

    def test_concurrent_duplicate_period_inserts_only_one_charge(self):
        barrier = threading.Barrier(2)

        def insert_charge(fee_id):
            with Session(self.engine) as db:
                db.add(StudentFee(
                    id=fee_id, student_id=1, organization_id=1, class_id=1, session_id=1, month="June",
                    total_amount=Decimal("1000.00"), monthly_fee=Decimal("1000.00"),
                    final_amount=Decimal("1000.00"),
                ))
                barrier.wait(timeout=10)
                try:
                    db.commit()
                    return "created"
                except IntegrityError:
                    db.rollback()
                    return "duplicate"

        with ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(insert_charge, 3)
            second = executor.submit(insert_charge, 4)
            results = [first.result(timeout=25), second.result(timeout=25)]
        self.assertCountEqual(results, ["created", "duplicate"])
        with Session(self.engine) as db:
            self.assertEqual(db.scalar(select(func.count(StudentFee.id)).where(StudentFee.month == "June")), 1)


if __name__ == "__main__":
    unittest.main()
