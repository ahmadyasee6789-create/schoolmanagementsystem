"""Exercise the actual migration revisions only on an explicitly local test DB.

No Alembic env.py or application database bootstrap is imported. The migration
functions run through Alembic Operations with this fixture's isolated connection.
"""
import importlib.util
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
import uuid
from decimal import Decimal

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from test_fee_postgres import validated_test_url


VERSIONS = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def revision_module(revision):
    matches = list(VERSIONS.glob(revision + "_*.py"))
    if len(matches) != 1:
        raise AssertionError(f"Expected exactly one migration for {revision}")
    spec = importlib.util.spec_from_file_location("test_revision_" + revision, matches[0])
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@unittest.skipUnless(os.environ.get("TEST_POSTGRES_URL"), "Set TEST_POSTGRES_URL to an explicit disposable local PostgreSQL database")
class PostgreSQLFeeMigrationTests(unittest.TestCase):
    def setUp(self):
        self.url = validated_test_url(os.environ["TEST_POSTGRES_URL"])
        self.schema = "fee_migration_" + uuid.uuid4().hex
        self.admin_engine = create_engine(self.url, connect_args={"connect_timeout": 5})
        self.addCleanup(self.admin_engine.dispose)
        with self.admin_engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{self.schema}"'))
        self.addCleanup(self.drop_schema)
        self.engine = create_engine(self.url, connect_args={
            "connect_timeout": 5,
            "options": f"-c search_path={self.schema} -c statement_timeout=20000 -c lock_timeout=10000",
        })
        self.addCleanup(self.engine.dispose)
        with self.engine.begin() as connection:
            with Operations.context(MigrationContext.configure(connection)):
                for revision in ("d7c3f22d287b", "e41b62a901df", "f8a29d10c6b4"):
                    revision_module(revision).upgrade()
            self.seed_legacy_data(connection)
        self.revision = revision_module("g31f70e2a964")

    def drop_schema(self):
        with self.admin_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{self.schema}" CASCADE'))

    def seed_legacy_data(self, connection):
        statements = (
            "INSERT INTO organizations (id,name,status,plan,created_at) VALUES (1,'Synthetic Legacy School','active','basic',CURRENT_TIMESTAMP)",
            "INSERT INTO users (id,full_name,email,is_superadmin,is_active,created_at) VALUES (1,'Synthetic Accountant','migration@example.invalid',false,true,CURRENT_TIMESTAMP)",
            "INSERT INTO academic_sessions (id,organization_id,name,start_date,end_date,is_active) VALUES (1,1,'2026-27','2026-04-01','2027-03-31',true)",
            "INSERT INTO grades (id,organization_id,name,display_order) VALUES (1,1,'Test Grade',1)",
            "INSERT INTO classrooms (id,organization_id,grade_id,section,academic_year_id) VALUES (1,1,1,'A',1)",
            "INSERT INTO students (id,organization_id,admission_no,first_name,last_name,is_active,created_at,updated_at) VALUES (1,1,'LEGACY-001','Synthetic','Student',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
            "INSERT INTO student_enrollments (id,student_id,session_id,classroom_id,discount_percent,enrollment_date,is_active) VALUES (1,1,1,1,12.25,'2026-04-01',true)",
            "INSERT INTO fee_structures (id,organization_id,class_id,session_id,admission_fee,monthly_fee,exam_fee) VALUES (1,1,1,1,0.50,1000.25,0.75)",
            "INSERT INTO student_fees (id,class_id,student_id,organization_id,session_id,month,admission_fee,monthly_fee,exam_fee,total_amount,discount_percent,discount_amount,final_amount,paid_amount,status) VALUES (1,1,1,1,1,'April',0,1000,0,1000,12.25,122.50,877.50,250,'partial')",
            "INSERT INTO fee_transactions (id,student_fee_id,organization_id,amount,payment_date,receipt_no,created_by) VALUES (1,1,1,250,'2026-04-05','LEGACY-RECEIPT-001',1)",
            "SELECT setval(pg_get_serial_sequence('student_fees','id'),1)",
            "SELECT setval(pg_get_serial_sequence('fee_transactions','id'),1)",
        )
        for statement in statements:
            connection.execute(text(statement))

    def upgrade(self):
        with self.engine.begin() as connection:
            with Operations.context(MigrationContext.configure(connection)):
                self.revision.upgrade()

    def original_rows(self):
        with self.engine.connect() as connection:
            # Explicit original fields let us compare values before/after new
            # nullable idempotency fields are added, without inventing history.
            return {
                "fee": connection.execute(text("SELECT id,class_id,student_id,organization_id,session_id,month,admission_fee,monthly_fee,exam_fee,total_amount,discount_percent,discount_amount,final_amount,paid_amount,status FROM student_fees ORDER BY id")).all(),
                "payments": connection.execute(text("SELECT id,student_fee_id,organization_id,amount,payment_date,receipt_no,created_by FROM fee_transactions ORDER BY id")).all(),
                "discounts": connection.execute(text("SELECT id,discount_percent::numeric FROM student_enrollments ORDER BY id")).all(),
                "structures": connection.execute(text("SELECT * FROM fee_structures ORDER BY id")).all(),
            }

    def assert_preflight_refuses_without_changes(self, expected):
        before = self.original_rows()
        with self.assertRaisesRegex(RuntimeError, expected):
            self.upgrade()
        self.assertEqual(self.original_rows(), before)
        with self.engine.connect() as connection:
            columns = inspect(connection).get_columns("fee_transactions")
            self.assertNotIn("idempotency_key", {column["name"] for column in columns})
            monthly = next(column for column in inspect(connection).get_columns("student_fees") if column["name"] == "monthly_fee")
            self.assertEqual(str(monthly["type"]), "INTEGER")

    def test_upgrade_preserves_legacy_values_and_supports_exact_cent_collection(self):
        before = self.original_rows()
        self.upgrade()
        self.assertEqual(self.original_rows(), before)
        with self.engine.connect() as connection:
            legacy = connection.execute(text("SELECT idempotency_key,paid_amount_after,fee_status_after FROM fee_transactions WHERE id=1")).one()
            self.assertEqual(tuple(legacy), (None, None, None))
            discount_type = next(column["type"] for column in inspect(connection).get_columns("student_enrollments") if column["name"] == "discount_percent")
            self.assertEqual(str(discount_type), "NUMERIC(5, 2)")
        from app.services.fee_collection import collect_fee_payment
        with Session(self.engine) as db:
            result = collect_fee_payment(db, SimpleNamespace(id=1, org_id=1, org_role="accountant"), 1, Decimal("0.25"), "migration-payment")
        self.assertEqual(result["paid_amount"], 250.25)
        with self.engine.connect() as connection:
            self.assertEqual(connection.scalar(text("SELECT paid_amount FROM student_fees WHERE id=1")), Decimal("250.25"))
            self.assertEqual(connection.scalar(text("SELECT count(*) FROM fee_transactions")), 2)

    def test_duplicate_legacy_period_refuses_and_rolls_back(self):
        with self.engine.begin() as connection:
            connection.execute(text("INSERT INTO student_fees (id,class_id,student_id,organization_id,session_id,month,admission_fee,monthly_fee,exam_fee,total_amount,discount_percent,discount_amount,final_amount,paid_amount,status) VALUES (2,1,1,1,1,'April',0,1000,0,1000,0,0,1000,0,'unpaid')"))
        self.assert_preflight_refuses_without_changes("duplicate student/session/month")

    def test_fractional_legacy_precision_refuses_without_rounding(self):
        with self.engine.begin() as connection:
            connection.execute(text("UPDATE student_fees SET discount_amount=122.501,final_amount=877.499 WHERE id=1"))
        self.assert_preflight_refuses_without_changes("invalid fee amounts or precision")

    def test_unreconciled_legacy_balance_refuses_without_inventing_payments(self):
        with self.engine.begin() as connection:
            connection.execute(text("UPDATE student_fees SET paid_amount=251 WHERE id=1"))
        self.assert_preflight_refuses_without_changes("paid balances differing from transaction history")

    def test_invalid_legacy_discount_refuses_without_rounding(self):
        with self.engine.begin() as connection:
            connection.execute(text("UPDATE student_enrollments SET discount_percent=12.345 WHERE id=1"))
        self.assert_preflight_refuses_without_changes("invalid enrollment discounts")

    def test_legacy_tenant_mismatch_refuses_without_reassigning_history(self):
        with self.engine.begin() as connection:
            connection.execute(text("INSERT INTO organizations (id,name,status,plan,created_at) VALUES (2,'Other Synthetic School','active','basic',CURRENT_TIMESTAMP)"))
            connection.execute(text("UPDATE fee_structures SET organization_id=2 WHERE id=1"))
        self.assert_preflight_refuses_without_changes("fee structure classroom/session tenant mismatch")

    def test_migrated_foreign_keys_block_raw_deletion_of_financial_history(self):
        self.upgrade()
        for table in ("students", "student_fees"):
            with self.subTest(table=table):
                with self.assertRaises(IntegrityError):
                    with self.engine.begin() as connection:
                        connection.execute(text(f"DELETE FROM {table} WHERE id=1"))
        with self.engine.connect() as connection:
            for table in ("students", "student_fees", "fee_transactions"):
                self.assertEqual(connection.scalar(text(f"SELECT count(*) FROM {table}")), 1)
            for table, column in (("student_fees", "student_id"), ("fee_transactions", "student_fee_id")):
                fk = next(fk for fk in inspect(connection).get_foreign_keys(table) if fk["constrained_columns"] == [column])
                self.assertEqual(fk["options"].get("ondelete"), "RESTRICT")

    def test_migrated_checks_reject_nan_negative_and_invalid_discount(self):
        self.upgrade()
        updates = (
            "UPDATE fee_transactions SET amount='NaN' WHERE id=1",
            "UPDATE fee_transactions SET amount=0 WHERE id=1",
            "UPDATE fee_transactions SET amount=-1 WHERE id=1",
            "UPDATE student_fees SET monthly_fee='NaN' WHERE id=1",
            "UPDATE student_fees SET paid_amount=900 WHERE id=1",
            "UPDATE student_fees SET discount_percent=101 WHERE id=1",
            "UPDATE student_enrollments SET discount_percent='NaN' WHERE id=1",
            "UPDATE student_enrollments SET discount_percent=101 WHERE id=1",
            "UPDATE fee_structures SET monthly_fee='NaN' WHERE id=1",
        )
        for update in updates:
            with self.subTest(update=update):
                with self.assertRaises(IntegrityError):
                    with self.engine.begin() as connection:
                        connection.execute(text(update))

    def test_automatic_downgrade_refuses_preserving_history_and_schema(self):
        self.upgrade()
        before = self.original_rows()
        with self.assertRaisesRegex(RuntimeError, "Automatic downgrade is intentionally disabled"):
            with self.engine.begin() as connection:
                with Operations.context(MigrationContext.configure(connection)):
                    self.revision.downgrade()
        self.assertEqual(self.original_rows(), before)
        with self.engine.connect() as connection:
            self.assertIn("idempotency_key", {column["name"] for column in inspect(connection).get_columns("fee_transactions")})


if __name__ == "__main__":
    unittest.main()
