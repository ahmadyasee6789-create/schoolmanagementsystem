"""Phase 2 against an isolated loopback PostgreSQL database; no migrations."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from decimal import Decimal
import os
import threading
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError, ProgrammingError
from sqlalchemy.orm import Session

import test_fee_postgres as pg
from app.models.fee_allocation import FeeAllocation
from app.models.fee_collection_command import FeeCollectionCommand
from app.models.fee_structure import FeeStructure
from app.models.fee_transection import FeeTransaction
from app.models.student_enrollment import StudentEnrollment
from app.models.student_fee import StudentFee
from app.schemas.fee_collection import CollectionPreviewRequest, CollectionRequest
from app.services import multi_fee_collection as multi
from app.services.fee_allocations import remaining_credit
from app.services.monthly_fees import get_or_create_monthly_fee


@unittest.skipUnless(os.environ.get("TEST_POSTGRES_URL"), "Requires disposable local PostgreSQL")
class PostgreSQLMultiFeeTests(unittest.TestCase):
    drop_schema = pg.PostgreSQLFeeCollectionTests.drop_schema

    def setUp(self):
        pg.PostgreSQLFeeCollectionTests.setUp(self)
        del self.collect  # The shared fixture installs its single-fee helper.
        with Session(self.engine) as db:
            db.add(StudentEnrollment(student_id=1, session_id=1, classroom_id=1, is_active=True,
                                     enrollment_date=date(2026, 4, 1), discount_percent=0))
            db.add(FeeStructure(organization_id=1, class_id=1, session_id=1,
                                admission_fee=50, monthly_fee=700, exam_fee=20, rates_finalized=True))
            db.execute(text("SELECT setval(pg_get_serial_sequence('student_fees','id'), (SELECT max(id) FROM student_fees))"))
            db.commit()

    def request(self, months=None, **values):
        request = CollectionPreviewRequest(student_id=1, session_id=1,
                                          billing_periods=["2026-10"] if months is None else months, **values)
        with Session(self.engine, autoflush=False) as db:
            preview = multi.preview_collection(db, self.actor, request)
        return CollectionRequest(**request.model_dump(), preview_id=preview["preview_id"])

    def collect(self, request, key, barrier=None):
        with Session(self.engine, autoflush=False) as db:
            # Deliberately cache rows before waiting: post-lock queries must refresh.
            db.query(StudentFee).all()
            db.query(FeeTransaction).all()
            if barrier:
                barrier.wait(timeout=10)
            try:
                return multi.collect_multi(db, self.actor, request, key)
            except HTTPException as exc:
                return exc.status_code

    def race(self, *requests):
        barrier = threading.Barrier(len(requests))
        with ThreadPoolExecutor(max_workers=len(requests)) as pool:
            futures = [pool.submit(self.collect, request, key, barrier) for request, key in requests]
            return [f.result(timeout=30) for f in futures]

    def assert_invariants(self, cash, allocations, commands):
        with Session(self.engine) as db:
            self.assertEqual(db.scalar(select(func.coalesce(func.sum(FeeTransaction.amount), 0))), Decimal(cash))
            self.assertEqual(db.scalar(select(func.coalesce(func.sum(FeeAllocation.amount), 0))), Decimal(allocations))
            self.assertEqual(db.scalar(select(func.coalesce(func.sum(StudentFee.paid_amount), 0))), Decimal(allocations))
            self.assertEqual(db.query(FeeCollectionCommand).count(), commands)
            for payment in db.query(FeeTransaction).all():
                self.assertGreaterEqual(remaining_credit(db, payment), 0)
            self.assertFalse(db.query(StudentFee.id).filter(StudentFee.paid_amount > StudentFee.final_amount).first())

    def test_same_key_concurrent_retries_return_exact_snapshot(self):
        request = self.request(["2026-10", "2026-11", "2026-12"], amount="2100.00")
        results = self.race((request, "same-multi-key"), (request, "same-multi-key"))
        self.assertIsInstance(results[0], dict)
        self.assertEqual(results[0], results[1])
        self.assert_invariants("2100", "2100", 1)

    def test_distinct_key_competing_collections_reject_stale_confirmation(self):
        request = self.request(["2026-04"], amount="600.00")
        results = self.race((request, "different-key-a"), (request, "different-key-b"))
        self.assertEqual(sum(isinstance(r, dict) for r in results), 1)
        self.assertIn(409, results)
        self.assert_invariants("600", "600", 1)

    def test_same_key_different_requests_cannot_both_succeed(self):
        a = self.request(["2026-04"], amount="200.00")
        b = self.request(["2026-04"], amount="300.00")
        results = self.race((a, "shared-key-001"), (b, "shared-key-001"))
        self.assertIn(409, results)
        success = next(r for r in results if isinstance(r, dict))
        self.assert_invariants(success["cash_received"], success["cash_received"], 1)

    def test_concurrent_credit_consumption_cannot_spend_same_credit_twice(self):
        advance = self.request([], period_type="advance_only", amount="1000.00", retain_excess_as_credit=True)
        self.collect(advance, "advance-key-001")
        a, b = self.request(["2026-10"], credit_amount="700.00"), self.request(["2026-11"], credit_amount="700.00")
        results = self.race((a, "credit-key-a"), (b, "credit-key-b"))
        self.assertIn(409, results)
        self.assertEqual(sum(isinstance(r, dict) for r in results), 1)
        self.assert_invariants("1000", "700", 2)
        with Session(self.engine) as db:
            self.assertEqual(db.query(FeeTransaction).count(), 1)
            self.assertEqual(remaining_credit(db, db.query(FeeTransaction).one()), Decimal(300))

    def test_credit_only_concurrent_replay_does_not_issue_a_second_receipt(self):
        self.collect(self.request([], period_type="advance_only", amount="1000.00", retain_excess_as_credit=True), "advance-key-001")
        request = self.request(["2026-10"], credit_amount="700.00")
        results = self.race((request, "same-credit-key"), (request, "same-credit-key"))
        self.assertEqual(results[0], results[1])
        self.assertIsNone(results[0]["receipt_no"])
        self.assert_invariants("1000", "700", 2)

    def test_concurrent_generate_and_collect_preserve_one_month_and_admission(self):
        request = self.request(["2026-10"], amount="750.00", admission_period="2026-10")
        barrier = threading.Barrier(2)
        def generate():
            with Session(self.engine, autoflush=False) as db:
                barrier.wait(timeout=10)
                fee, created = get_or_create_monthly_fee(db, org_id=1, student_id=1, session_id=1, period=date(2026, 10, 1))
                result = fee.id
                db.commit()
                return result
        with ThreadPoolExecutor(max_workers=2) as pool:
            one = pool.submit(self.collect, request, "collect-generate-key", barrier)
            two = pool.submit(generate)
            result, generated_id = one.result(timeout=30), two.result(timeout=30)
        with Session(self.engine) as db:
            self.assertEqual(db.query(StudentFee).count(), 3)
            self.assertEqual(db.get(StudentFee, generated_id).admission_fee, Decimal(50))
            self.assertEqual(db.scalar(select(func.sum(StudentFee.admission_fee))), Decimal(50))
        cash = "750" if isinstance(result, dict) else "0"
        if not isinstance(result, dict):
            self.assertEqual(result, 409)
        self.assert_invariants(cash, cash, int(isinstance(result, dict)))

    def test_real_database_rollback_removes_payment_fees_and_allocations(self):
        request = self.request(["2026-10", "2026-11"], amount="1400.00")
        original = multi.allocate_payment
        count = 0
        def fail_second(*args, **kwargs):
            nonlocal count
            count += 1
            if count == 2:
                raise RuntimeError("injected failure")
            return original(*args, **kwargs)
        with patch.object(multi, "allocate_payment", side_effect=fail_second), self.assertRaises(RuntimeError):
            self.collect(request, "rollback-key-001")
        self.assert_invariants("0", "0", 0)
        with Session(self.engine) as db:
            self.assertEqual(db.query(StudentFee).count(), 2)
        self.assertIsInstance(self.collect(request, "rollback-key-001"), dict)
        self.assert_invariants("1400", "1400", 1)

    def test_command_uniqueness_and_restrictive_foreign_keys(self):
        self.collect(self.request(amount="700.00"), "constraint-key-001")
        with Session(self.engine) as db:
            command = db.query(FeeCollectionCommand).one()
            db.add(FeeCollectionCommand(organization_id=1, student_id=1, session_id=1,
                                        created_by=1, idempotency_key=command.idempotency_key,
                                        request_fingerprint="a"*64, response_snapshot={}))
            with self.assertRaises(IntegrityError):
                db.commit()
            db.rollback()
            with self.assertRaises(IntegrityError):
                db.execute(text("UPDATE fee_collection_commands SET organization_id=2"))
            db.rollback()
            with self.assertRaises(IntegrityError):
                db.execute(text("DELETE FROM fee_transactions"))
            db.rollback()

    def test_command_rls_blocks_untrusted_reads_and_writes(self):
        self.collect(self.request(amount="700.00"), "private-command-001")
        with self.engine.connect() as connection:
            self.assertTrue(connection.scalar(text("SELECT relrowsecurity FROM pg_class WHERE oid='fee_collection_commands'::regclass")))
            connection.execute(text("CREATE ROLE phase2_untrusted"))
            connection.execute(text(f'GRANT USAGE ON SCHEMA "{self.schema}" TO phase2_untrusted'))
            connection.execute(text("GRANT SELECT, INSERT ON fee_collection_commands TO phase2_untrusted"))
            connection.execute(text("SET LOCAL ROLE phase2_untrusted"))
            self.assertEqual(connection.scalar(text("SELECT count(*) FROM fee_collection_commands")), 0)
            with self.assertRaises(ProgrammingError):
                connection.execute(text("INSERT INTO fee_collection_commands (id,organization_id,student_id,session_id,created_by,idempotency_key,request_fingerprint,response_snapshot) VALUES (99,1,1,1,1,'forbidden-key',repeat('a',64),'{}')"))
            connection.rollback()


if __name__ == "__main__":
    unittest.main()
