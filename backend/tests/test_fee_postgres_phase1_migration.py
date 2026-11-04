"""Execute historical migrations only on the explicit disposable loopback DB.

Build the predecessor by executing the historical revisions, not create_all.
Never import Alembic env.py or read the application's DATABASE_URL/.env.
The current-application compatibility case also applies i53: Phase 2 application
code requires its command table. Other h42 checks remain pinned to h42.
"""
from datetime import date
from decimal import Decimal
import json
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import test_fee_postgres_migration as historical
from app.db.fee_migration_v1 import FeeBackfillError


@unittest.skipUnless(os.environ.get("TEST_POSTGRES_URL"), "Requires an explicitly disposable local PostgreSQL database")
class PostgreSQLAllocationMigrationTests(unittest.TestCase):
    drop_schema = historical.PostgreSQLFeeMigrationTests.drop_schema
    seed_legacy_data = historical.PostgreSQLFeeMigrationTests.seed_legacy_data

    def setUp(self):
        historical.PostgreSQLFeeMigrationTests.setUp(self)
        config = Config()
        config.set_main_option("script_location", str(historical.VERSIONS.parent))
        self.script = ScriptDirectory.from_config(config)
        self.assertEqual(self.script.get_revision("h42a81f3b075").down_revision, "g31f70e2a964")
        with self.engine.begin() as connection:
            context = MigrationContext.configure(connection)
            with Operations.context(context):
                self.revision.upgrade()  # Actual g31 DDL/preflight.
            self.seed_representative_data(connection)
            context.stamp(self.script, "g31f70e2a964")
            self.original_columns = {
                table: [column["name"] for column in inspect(connection).get_columns(table)]
                for table in ("organizations", "users", "students", "academic_sessions", "grades",
                              "classrooms", "student_enrollments", "fee_structures", "student_fees", "fee_transactions")
            }
        self.revision = historical.revision_module("h42a81f3b075")

    def seed_representative_data(self, connection):
        # Synthetic records: no source DB data or personal details are copied.
        statements = (
            "INSERT INTO organizations (id,name,status,plan,created_at) VALUES (2,'Second Synthetic School','active','basic',CURRENT_TIMESTAMP)",
            "INSERT INTO academic_sessions (id,organization_id,name,start_date,end_date,is_active) VALUES (2,2,'2026-27','2026-04-01','2027-03-31',true)",
            "INSERT INTO grades (id,organization_id,name,display_order) VALUES (2,2,'Test Grade',1)",
            "INSERT INTO classrooms (id,organization_id,grade_id,section,academic_year_id) VALUES (2,2,2,'A',2)",
            "INSERT INTO students (id,organization_id,admission_no,first_name,last_name,is_active,created_at,updated_at) VALUES (2,2,'SYNTHETIC-002','Synthetic','Second',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
            "INSERT INTO student_enrollments (id,student_id,session_id,classroom_id,discount_percent,enrollment_date,is_active) VALUES (2,2,2,2,0,'2026-04-01',true)",
            "INSERT INTO fee_structures (id,organization_id,class_id,session_id,admission_fee,monthly_fee,exam_fee) VALUES (2,2,2,2,0,2000.99,0)",
            "INSERT INTO student_fees (id,class_id,student_id,organization_id,session_id,month,admission_fee,monthly_fee,exam_fee,total_amount,discount_percent,discount_amount,final_amount,paid_amount,status) VALUES (2,1,1,1,1,'May',50,1000.04,20,1070.04,12.50,125.01,945.03,945.03,'paid'),(3,1,1,1,1,'January',0,1001,0,1001,3.33,33.33,967.67,50.25,'partial'),(4,1,1,1,1,'June',0,750,0,750,0,0,750,0,'unpaid'),(5,1,1,1,1,'July',0,100,0,100,100,100,0,0,'paid'),(6,2,2,2,2,'April',0,2000.99,0,2000.99,0,0,2000.99,2000.99,'paid')",
            "INSERT INTO fee_transactions (id,student_fee_id,organization_id,amount,payment_date,receipt_no,created_by,idempotency_key,paid_amount_after,fee_status_after) VALUES (2,2,1,500.01,'2026-05-02','MIGRATION-002',1,'MIGRATION-PAY-2',500.01,'partial'),(3,2,1,445.02,'2026-05-03','MIGRATION-003',1,'MIGRATION-PAY-3',945.03,'paid'),(4,3,1,50.25,'2026-12-15','MIGRATION-004',1,'MIGRATION-PAY-4',50.25,'partial'),(5,6,2,2000.99,'2026-04-10','LEGACY-RECEIPT-001',1,'MIGRATION-PAY-2',2000.99,'paid')",
            "SELECT setval(pg_get_serial_sequence('student_fees','id'),6)",
            "SELECT setval(pg_get_serial_sequence('fee_transactions','id'),5)",
        )
        for statement in statements:
            connection.execute(text(statement))

    def snapshot(self):
        with self.engine.connect() as connection:
            return {table: connection.execute(text(
                'SELECT ' + ','.join(columns) + ' FROM ' + table + ' ORDER BY id'
            )).all() for table, columns in self.original_columns.items()}

    def upgrade(self):
        with self.engine.begin() as connection:
            context = MigrationContext.configure(connection)
            with Operations.context(context):
                self.revision.upgrade()
            context.stamp(self.script, "h42a81f3b075")

    def assert_predecessor_unchanged(self, before):
        self.assertEqual(before, self.snapshot())
        with self.engine.connect() as connection:
            self.assertEqual(connection.scalar(text("SELECT version_num FROM alembic_version")), "g31f70e2a964")
            self.assertFalse(inspect(connection).has_table("fee_allocations"))
            self.assertNotIn("billing_period", {column["name"] for column in inspect(connection).get_columns("student_fees")})
            self.assertIn("uq_student_fee_period", {constraint["name"] for constraint in inspect(connection).get_unique_constraints("student_fees")})

    def test_real_upgrade_preserves_every_original_field_and_reconciles_allocations(self):
        before = self.snapshot()
        self.upgrade()
        self.assertEqual(before, self.snapshot())
        with self.engine.connect() as connection:
            self.assertEqual(connection.scalar(text("SELECT version_num FROM alembic_version")), "h42a81f3b075")
            fees = connection.execute(text("SELECT id,billing_period,final_amount,paid_amount FROM student_fees ORDER BY id")).all()
            self.assertEqual([row.billing_period for row in fees], [date(2026,4,1), date(2026,5,1), date(2027,1,1), date(2026,6,1), date(2026,7,1), date(2026,4,1)])
            allocations = connection.execute(text("SELECT transaction_id,student_fee_id,organization_id,student_id,session_id,amount FROM fee_allocations ORDER BY transaction_id")).all()
            expected = connection.execute(text("SELECT t.id,t.student_fee_id,t.organization_id,f.student_id,f.session_id,t.amount FROM fee_transactions t JOIN student_fees f ON f.id=t.student_fee_id ORDER BY t.id")).all()
            self.assertEqual(allocations, expected)
            self.revision.verify_backfill(connection)
            totals = connection.execute(text("SELECT (SELECT sum(final_amount) FROM student_fees) AS billed,(SELECT sum(paid_amount) FROM student_fees) AS paid,(SELECT sum(amount) FROM fee_transactions) AS cash,(SELECT sum(amount) FROM fee_allocations) AS allocated")).mappings().one()
            self.assertEqual(dict(totals), dict(billed=Decimal("5541.19"), paid=Decimal("3246.27"), cash=Decimal("3246.27"), allocated=Decimal("3246.27")))
            self.assertEqual(totals["billed"] - totals["paid"], Decimal("2294.92"))
            self.assertEqual(connection.scalar(text("SELECT count(*) FROM fee_transactions WHERE request_fingerprint IS NOT NULL OR response_snapshot IS NOT NULL")), 0)
            self.assertEqual(connection.scalar(text("SELECT count(*) FROM fee_transactions WHERE receipt_no='LEGACY-RECEIPT-001'")), 2)
            # Persist only synthetic verification evidence; no credentials/host.
            artifact = Path(__file__).resolve().parents[1] / "validation" / "phase1_migration_rehearsal.json"
            artifact.parent.mkdir(exist_ok=True)
            artifact.write_text(json.dumps({
                "target": "disposable loopback PostgreSQL", "revision_before": "g31f70e2a964", "revision_after": "h42a81f3b075",
                "fee_count": len(fees), "payment_count": len(expected), "allocation_count": len(allocations),
                "all_original_fields_preserved": before == self.snapshot(), "totals": dict(totals),
                "outstanding": totals["billed"] - totals["paid"],
                "payment_to_allocation_rows": [dict(zip(("transaction_id","student_fee_id","organization_id","student_id","session_id","amount"), row)) for row in allocations],
            }, default=str, indent=2), encoding="utf-8")

    def test_legacy_replay_and_receipt_and_new_collection_work_after_actual_migration(self):
        self.upgrade()
        before = self.snapshot()
        with self.engine.begin() as connection:
            context = MigrationContext.configure(connection)
            with Operations.context(context):
                historical.revision_module("i53b92a4c186").upgrade()
            context.stamp(self.script, "i53b92a4c186")
            self.assertEqual(connection.scalar(text("SELECT count(*) FROM fee_collection_commands")), 0)
            self.assertEqual(connection.scalar(text("SELECT count(*) FROM fee_structures WHERE rates_finalized")), 0)
        self.assertEqual(before, self.snapshot())
        from app.services.fee_collection import collect_fee_payment
        with patch.dict(os.environ, {"DATABASE_URL": "sqlite://"}):
            from app.routers.student_fee import download_payment_receipt
        actor = SimpleNamespace(id=1, org_id=1, org_role="accountant")
        with Session(self.engine) as db:
            replay = collect_fee_payment(db, actor, 2, Decimal("500.01"), "MIGRATION-PAY-2")
            self.assertEqual(replay["transaction_id"], 2)
            self.assertEqual(replay["paid_amount"], 500.01)
            self.assertEqual(replay["status"], "partial")
            receipt = download_payment_receipt(1, db, actor)
            self.assertTrue(receipt.body.startswith(b"%PDF"))
            first = collect_fee_payment(db, actor, 1, Decimal("0.25"), "post-h42-payment")
            self.assertEqual(first, collect_fee_payment(db, actor, 1, Decimal("0.25"), "post-h42-payment"))
            self.assertEqual(first["paid_amount"], 250.25)
            self.assertEqual(db.scalar(text("SELECT count(*) FROM fee_transactions")), 6)
            self.assertEqual(db.scalar(text("SELECT count(*) FROM fee_allocations")), 6)

    def test_credit_and_multiple_allocations_work_on_migrated_schema(self):
        self.upgrade()
        from app.models.fee_transection import FeeTransaction
        from app.services.fee_allocations import allocate_payment, remaining_credit
        from app.services.fee_collection import lock_financial_organization
        with Session(self.engine) as db:
            lock_financial_organization(db, 1)
            payment = FeeTransaction(organization_id=1, student_id=1, session_id=1, amount=Decimal(1500), receipt_no="ADVANCE-AFTER-UPGRADE", created_by=1)
            db.add(payment)
            db.flush()
            allocate_payment(db, org_id=1, transaction_id=payment.id, fee_id=1, amount=Decimal(100))
            allocate_payment(db, org_id=1, transaction_id=payment.id, fee_id=4, amount=Decimal(200))
            db.commit()
            self.assertEqual(remaining_credit(db, payment), Decimal(1200))
            self.assertEqual(db.scalar(text("SELECT sum(amount) FROM fee_transactions")), Decimal("4746.27"))
            self.assertEqual(db.scalar(text("SELECT sum(amount) FROM fee_allocations")), Decimal("3546.27"))

    def test_ambiguous_source_shaped_sessions_abort_without_schema_or_financial_changes(self):
        with self.engine.begin() as connection:
            connection.execute(text("UPDATE academic_sessions SET start_date='2026-04-14',end_date='2027-04-14' WHERE id=1"))
            connection.execute(text("UPDATE academic_sessions SET start_date='2026-04-19',end_date='2027-04-19' WHERE id=2"))
            connection.execute(text("UPDATE student_enrollments SET enrollment_date='2026-05-19' WHERE id=2"))
        before = self.snapshot()
        with self.assertRaises(FeeBackfillError) as failure:
            self.upgrade()
        self.assertEqual({issue["id"] for issue in failure.exception.issues if "no unique year" in issue["reason"]}, {1, 6})
        self.assert_predecessor_unchanged(before)

    def test_outside_enrollment_is_not_repaired_by_migration(self):
        with self.engine.begin() as connection:
            connection.execute(text("UPDATE student_enrollments SET enrollment_date='2026-05-19' WHERE id=2"))
        before = self.snapshot()
        with self.assertRaisesRegex(FeeBackfillError, "does not overlap enrollment"):
            self.upgrade()
        self.assert_predecessor_unchanged(before)

    def test_unreconciled_historical_balance_aborts_without_fabricating_payment(self):
        with self.engine.begin() as connection:
            connection.execute(text("UPDATE student_fees SET paid_amount=251 WHERE id=1"))
        before = self.snapshot()
        with self.assertRaisesRegex(FeeBackfillError, "does not reconcile"):
            self.upgrade()
        self.assert_predecessor_unchanged(before)

    def test_post_backfill_failure_rolls_back_ddl_backfill_constraints_and_revision(self):
        before = self.snapshot()
        with patch.object(self.revision, "verify_backfill", side_effect=RuntimeError("Injected final verification failure")):
            with self.assertRaisesRegex(RuntimeError, "Injected final"):
                self.upgrade()
        self.assert_predecessor_unchanged(before)

    def test_new_constraints_enforce_period_owner_amount_and_restrict_history_deletion(self):
        self.upgrade()
        attempts = (
            "UPDATE student_fees SET billing_period='2026-04-02' WHERE id=1",
            "UPDATE student_fees SET billing_period='2026-04-01' WHERE id=2",
            "UPDATE fee_allocations SET amount=0 WHERE transaction_id=1",
            "UPDATE fee_allocations SET organization_id=2 WHERE transaction_id=1",
            "UPDATE fee_allocations SET student_fee_id=6 WHERE transaction_id=1",
            "DELETE FROM fee_transactions WHERE id=1",
            "DELETE FROM student_fees WHERE id=1",
            "DELETE FROM students WHERE id=1",
        )
        before = self.snapshot()
        for statement in attempts:
            with self.subTest(statement=statement), self.assertRaises(IntegrityError):
                with self.engine.begin() as connection:
                    connection.execute(text(statement))
        self.assertEqual(before, self.snapshot())

    def test_old_writers_fail_closed_and_automatic_downgrade_is_refused(self):
        self.upgrade()
        before = self.snapshot()
        with self.assertRaises(IntegrityError):
            with self.engine.begin() as connection:
                connection.execute(text("INSERT INTO fee_transactions (student_fee_id,organization_id,amount,payment_date,receipt_no) VALUES (1,1,1,'2026-06-01','OLD-WRITER')"))
        with self.assertRaisesRegex(RuntimeError, "Automatic downgrade"):
            with self.engine.begin() as connection:
                with Operations.context(MigrationContext.configure(connection)):
                    self.revision.downgrade()
        self.assertEqual(before, self.snapshot())
        with self.engine.connect() as connection:
            self.assertEqual(connection.scalar(text("SELECT version_num FROM alembic_version")), "h42a81f3b075")

    def test_migration_enables_rls_and_revokes_inherited_public_api_grants(self):
        # Role creation is transactional and unique to this disposable cluster.
        # Existing roles, if any, are never altered or dropped.
        with self.engine.begin() as connection:
            connection.execute(text("""DO $roles$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
            END $roles$"""))
        with self.engine.begin() as connection:
            # Scope default grants to this generated test schema only.
            connection.execute(text(f'ALTER DEFAULT PRIVILEGES IN SCHEMA "{self.schema}" GRANT ALL ON TABLES TO anon, authenticated'))
            connection.execute(text(f'ALTER DEFAULT PRIVILEGES IN SCHEMA "{self.schema}" GRANT ALL ON SEQUENCES TO anon, authenticated'))
        self.upgrade()
        with self.engine.connect() as connection:
            self.assertTrue(connection.scalar(text("SELECT relrowsecurity FROM pg_class WHERE oid='fee_allocations'::regclass")))
            for role in ("anon", "authenticated"):
                for privilege in ("SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"):
                    self.assertFalse(connection.scalar(text("SELECT has_table_privilege(:role,'fee_allocations',:privilege)"), {"role":role,"privilege":privilege}))
                self.assertFalse(connection.scalar(text("SELECT has_sequence_privilege(:role,'fee_allocations_id_seq','USAGE')"), {"role":role}))
