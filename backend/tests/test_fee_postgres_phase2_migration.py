"""Real i53 migration rehearsal, exclusively on guarded disposable PostgreSQL.

Build h42 through the actual preceding migrations, never metadata.create_all.
Never import Alembic env.py or use the configured application database URL.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from decimal import Decimal
import hashlib
import json
import os
from pathlib import Path
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import HTTPException
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError, ProgrammingError, OperationalError
from sqlalchemy.orm import Session

import test_fee_postgres_migration as historical
import test_fee_postgres_phase1_migration as phase1
from app.models.fee_collection_command import FeeCollectionCommand
from app.models.fee_structure import FeeStructure
from app.models.fee_transection import FeeTransaction
from app.models.student_fee import StudentFee
from app.schemas.fee_collection import CollectionPreviewRequest, CollectionRequest
from app.services import multi_fee_collection as multi
from app.services.fee_allocations import allocate_payment, remaining_credit, reconciled_fee_balance
from app.services.fee_collection import collect_fee_payment
from app.services.fee_locks import lock_financial_organization


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


@unittest.skipUnless(os.environ.get("TEST_POSTGRES_URL"), "Requires an explicit disposable loopback PostgreSQL DB")
class PostgreSQLCollectionMigrationTests(unittest.TestCase):
    drop_schema = historical.PostgreSQLFeeMigrationTests.drop_schema
    seed_legacy_data = historical.PostgreSQLFeeMigrationTests.seed_legacy_data
    seed_representative_data = phase1.PostgreSQLAllocationMigrationTests.seed_representative_data

    def setUp(self):
        phase1.PostgreSQLAllocationMigrationTests.setUp(self)
        phase1.PostgreSQLAllocationMigrationTests.upgrade(self)
        # This rehearsal intentionally applies i53 only; j64 is separately
        # reviewed annual-discount DDL and must not be included implicitly.
        self.assertEqual(self.script.get_heads(), ["j64c03d5e297"])
        self.assertEqual(self.script.get_revision("i53b92a4c186").down_revision, "h42a81f3b075")
        self.revision = historical.revision_module("i53b92a4c186")
        self.actor = SimpleNamespace(id=1, org_id=1, org_role="accountant")
        # Representative Phase 1 credit history, created before the i53 migration.
        with Session(self.engine, autoflush=False) as db:
            lock_financial_organization(db, 1)
            split = FeeTransaction(organization_id=1, student_id=1, session_id=1,
                                   amount=Decimal("500.00"), payment_date=date(2026, 6, 1),
                                   receipt_no="H42-SPLIT-CREDIT", created_by=1)
            pure = FeeTransaction(organization_id=1, student_id=1, session_id=1,
                                  amount=Decimal("300.00"), payment_date=date(2026, 6, 2),
                                  receipt_no="H42-UNALLOCATED-CREDIT", created_by=1)
            db.add_all([split, pure])
            db.flush()
            self.split_payment_id, self.pure_payment_id = split.id, pure.id
            allocate_payment(db, org_id=1, transaction_id=split.id, fee_id=1, amount=Decimal("100.00"))
            allocate_payment(db, org_id=1, transaction_id=split.id, fee_id=4, amount=Decimal("200.00"))
            db.commit()
        with self.engine.connect() as connection:
            # Includes every original column: JSON snapshots, timestamps, dates,
            # receipts, keys, percentages and ownership, not merely grand totals.
            self.original_columns = {
                table: [c["name"] for c in inspect(connection).get_columns(table)]
                for table in (*self.original_columns, "fee_allocations")
            }

    def snapshot(self):
        with self.engine.connect() as connection:
            return {table: [dict(row) for row in connection.execute(text(
                'SELECT ' + ','.join('"' + c + '"' for c in columns)
                + ' FROM "' + table + '" ORDER BY id')).mappings()]
                    for table, columns in self.original_columns.items()}

    def totals(self):
        with self.engine.connect() as connection:
            return dict(connection.execute(text("""SELECT
                (SELECT count(*) FROM student_fees) AS fee_count,
                (SELECT count(*) FROM fee_transactions) AS payment_count,
                (SELECT count(*) FROM fee_allocations) AS allocation_count,
                (SELECT sum(final_amount) FROM student_fees) AS billed,
                (SELECT sum(paid_amount) FROM student_fees) AS paid,
                (SELECT sum(final_amount-paid_amount) FROM student_fees) AS outstanding,
                (SELECT sum(amount) FROM fee_transactions) AS cash,
                (SELECT sum(amount) FROM fee_allocations) AS allocated,
                (SELECT sum(amount) FROM fee_transactions)-(SELECT sum(amount) FROM fee_allocations) AS credit
            """)).mappings().one())

    def upgrade(self):
        with self.engine.begin() as connection:
            context = MigrationContext.configure(connection)
            with Operations.context(context):
                self.revision.upgrade()
            context.stamp(self.script, "i53b92a4c186")

    def schema_audit(self):
        with self.engine.connect() as connection:
            inspector = inspect(connection)
            table = "fee_collection_commands"
            return dict(
                columns=[{**c, "type": str(c["type"])} for c in inspector.get_columns(table)],
                primary_key=inspector.get_pk_constraint(table),
                unique_constraints=inspector.get_unique_constraints(table),
                foreign_keys=inspector.get_foreign_keys(table),
                check_constraints=inspector.get_check_constraints(table),
                indexes=inspector.get_indexes(table),
                rls=dict(connection.execute(text("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='fee_collection_commands'::regclass")).mappings().one()),
                policies=[dict(row) for row in connection.execute(text("SELECT policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname=:schema AND tablename=:table"), {"schema": self.schema, "table": table}).mappings()],
            )

    def assert_reconciled(self):
        with Session(self.engine) as db:
            for fee in db.query(StudentFee).all():
                self.assertGreaterEqual(reconciled_fee_balance(db, fee), 0)
            for payment in db.query(FeeTransaction).all():
                self.assertGreaterEqual(remaining_credit(db, payment), 0)

    def request(self, months, **values):
        request = CollectionPreviewRequest(student_id=1, session_id=1, billing_periods=months, **values)
        with Session(self.engine, autoflush=False) as db:
            preview = multi.preview_collection(db, self.actor, request)
        return CollectionRequest(**request.model_dump(), preview_id=preview["preview_id"])

    def collect(self, request, key):
        with Session(self.engine, autoflush=False) as db:
            return multi.collect_multi(db, self.actor, request, key)

    def assert_still_h42(self, before):
        self.assertEqual(before, self.snapshot())
        with self.engine.connect() as connection:
            self.assertEqual(connection.scalar(text("SELECT version_num FROM alembic_version")), "h42a81f3b075")
            self.assertFalse(inspect(connection).has_table("fee_collection_commands"))
            self.assertNotIn("rates_finalized", {c["name"] for c in inspect(connection).get_columns("fee_structures")})

    def test_migration_preserves_every_original_field_receipt_allocation_and_balance(self):
        before, totals_before = self.snapshot(), self.totals()
        self.assertEqual(totals_before, dict(fee_count=6, payment_count=7, allocation_count=7,
                                           billed=Decimal("5541.19"), paid=Decimal("3546.27"),
                                           outstanding=Decimal("1994.92"), cash=Decimal("4046.27"),
                                           allocated=Decimal("3546.27"), credit=Decimal("500.00")))
        self.upgrade()
        after = self.snapshot()
        self.assertEqual(before, after)
        self.assertEqual(self.totals(), totals_before)
        self.assert_reconciled()
        with self.engine.connect() as connection:
            self.assertEqual(connection.scalar(text("SELECT version_num FROM alembic_version")), "i53b92a4c186")
            self.assertEqual(connection.scalar(text("SELECT count(*) FROM fee_collection_commands")), 0)
            flags = list(connection.execute(text("SELECT id,rates_finalized FROM fee_structures ORDER BY id")))
            self.assertEqual([tuple(row) for row in flags], [(1, False), (2, False)])
            version = connection.scalar(text("SHOW server_version"))
        artifact = Path(__file__).resolve().parents[1] / "validation" / "phase2_migration_rehearsal.json"
        evidence = dict(target="disposable loopback PostgreSQL, synthetic data only", postgres_version=version,
                        revision_before="h42a81f3b075", revision_after="i53b92a4c186",
                        all_original_fields_preserved=True, totals_before=totals_before, totals_after=self.totals(),
                        table_fingerprints={table: dict(rows=len(before[table]),
                            before_sha256=hashlib.sha256(canonical(before[table]).encode()).hexdigest(),
                            after_sha256=hashlib.sha256(canonical(after[table]).encode()).hexdigest()) for table in before},
                        financial_rows_before={t: before[t] for t in ("student_fees", "fee_transactions", "fee_allocations", "fee_structures")},
                        financial_rows_after={t: after[t] for t in ("student_fees", "fee_transactions", "fee_allocations", "fee_structures")},
                        rates_finalized=[dict(id=row.id, rates_finalized=row.rates_finalized) for row in flags],
                        schema=self.schema_audit())
        artifact.write_text(json.dumps(evidence, indent=2, default=str), encoding="utf-8")

    def test_columns_constraints_indexes_defaults_and_orm_agree(self):
        self.upgrade()
        schema = self.schema_audit()
        columns = {c["name"]: c for c in schema["columns"]}
        self.assertEqual(set(columns), set(FeeCollectionCommand.__table__.columns.keys()))
        for column in FeeCollectionCommand.__table__.columns:
            self.assertEqual(columns[column.name]["nullable"], column.nullable)
            if column.name != "created_at":
                self.assertEqual(columns[column.name]["type"], str(column.type.compile(dialect=self.engine.dialect)))
        reflected_created_at = next(c for c in inspect(self.engine).get_columns("fee_collection_commands") if c["name"] == "created_at")
        self.assertTrue(reflected_created_at["type"].timezone)
        self.assertIn("nextval", columns["id"]["default"])
        self.assertIn("now()", columns["created_at"]["default"])
        self.assertEqual(schema["primary_key"]["constrained_columns"], ["id"])
        self.assertEqual({c["name"]: c["column_names"] for c in schema["unique_constraints"]},
                         {"uq_fee_command_key": ["organization_id", "idempotency_key"]})
        check = schema["check_constraints"]
        self.assertEqual(len(check), 1)
        self.assertEqual(check[0]["name"], "ck_fee_command_fingerprint")
        self.assertIn("64", check[0]["sqltext"])
        fks = {tuple(c["constrained_columns"]): c for c in schema["foreign_keys"]}
        self.assertEqual(len(fks), 4)
        for local, table, remote in (
            (("student_id", "organization_id"), "students", ["id", "organization_id"]),
            (("session_id", "organization_id"), "academic_sessions", ["id", "organization_id"]),
            (("transaction_id", "organization_id", "student_id", "session_id"), "fee_transactions", ["id", "organization_id", "student_id", "session_id"]),
            (("created_by",), "users", ["id"]),
        ):
            self.assertEqual(fks[local]["referred_table"], table)
            self.assertEqual(fks[local]["referred_columns"], remote)
            self.assertEqual(fks[local]["options"].get("ondelete"), "RESTRICT")
        explicit = [i for i in schema["indexes"] if not i.get("duplicates_constraint")]
        self.assertEqual([(i["name"], i["column_names"], i["unique"]) for i in explicit],
                         [("ix_fee_command_owner", ["organization_id", "student_id", "session_id"], False)])
        self.assertEqual(schema["rls"], dict(relrowsecurity=True, relforcerowsecurity=False))
        self.assertEqual(schema["policies"], [])
        with self.engine.connect() as connection:
            rate = next(c for c in inspect(connection).get_columns("fee_structures") if c["name"] == "rates_finalized")
            self.assertEqual(str(rate["type"]), "BOOLEAN")
            self.assertFalse(rate["nullable"])
            self.assertEqual(rate["default"], "false")
        with self.engine.begin() as connection:
            with self.assertRaises(IntegrityError):
                connection.execute(text("UPDATE fee_structures SET rates_finalized=NULL WHERE id=1"))

    def test_single_month_replay_receipt_and_new_collection_on_migrated_schema(self):
        self.upgrade()
        with patch.dict(os.environ, {"DATABASE_URL": "sqlite://"}):
            from app.routers.student_fee import collect_payment, download_payment_receipt
        from app.schemas.student_fee import PaymentCreate
        with Session(self.engine, autoflush=False) as db:
            replay = collect_payment(2, PaymentCreate(amount="500.01"), db, self.actor, "MIGRATION-PAY-2")
            self.assertEqual((replay["transaction_id"], replay["paid_amount"], replay["status"]), (2, 500.01, "partial"))
            result = collect_payment(1, PaymentCreate(amount="0.25"), db, self.actor, "i53-single-payment")
            self.assertEqual(result, collect_payment(1, PaymentCreate(amount="0.25"), db, self.actor, "i53-single-payment"))
            self.assertEqual(result["paid_amount"], 350.25)
            self.assertTrue(download_payment_receipt(1, db, self.actor).body.startswith(b"%PDF"))
            self.assertTrue(download_payment_receipt(result["transaction_id"], db, self.actor).body.startswith(b"%PDF"))
        self.assertEqual(self.totals()["cash"], Decimal("4046.52"))
        self.assertEqual(self.totals()["payment_count"], 8)
        self.assert_reconciled()

    def test_multi_month_generates_only_missing_fees_and_preserves_old_snapshots(self):
        self.upgrade()
        with self.engine.begin() as connection:
            connection.execute(text("UPDATE fee_structures SET rates_finalized=true WHERE id=1"))
        before = self.snapshot()
        request = self.request(["2026-10", "2026-11", "2026-12"], period_type="quarterly", amount="2000.00", payment_method="cash")
        self.assertEqual(before, self.snapshot())  # Preview must not create fees.
        result = self.collect(request, "i53-quarterly-payment")
        self.assertEqual(result, self.collect(request, "i53-quarterly-payment"))
        self.assertEqual([line["status"] for line in result["obligations"]], ["paid", "paid", "partial"])
        self.assertEqual([line["discount_amount"] for line in result["obligations"]], ["122.53"] * 3)
        self.assertEqual([line["final_amount"] for line in result["obligations"]], ["877.72"] * 3)
        after = self.snapshot()
        for table in ("student_fees", "fee_transactions", "fee_allocations"):
            self.assertEqual(before[table], after[table][:len(before[table])])
        self.assertEqual(self.totals()["fee_count"], 9)
        self.assertEqual(self.totals()["payment_count"], 8)
        self.assertEqual(self.totals()["cash"], Decimal("6046.27"))
        with patch.dict(os.environ, {"DATABASE_URL": "sqlite://"}):
            from app.routers.student_fee import download_payment_receipt, get_receipt_info
        with Session(self.engine) as db:
            info = get_receipt_info(result["transaction_id"], db, self.actor)
            self.assertEqual(info["cash_received"], "2000.00")
            self.assertEqual(len(info["allocations"]), 3)
            self.assertTrue(download_payment_receipt(result["transaction_id"], db, self.actor).body.startswith(b"%PDF"))
        self.assert_reconciled()

    def test_credit_only_uses_original_payments_without_new_cash_or_receipt(self):
        self.upgrade()
        before, totals_before = self.snapshot(), self.totals()
        request = self.request(["2026-06"], credit_amount="400.00")
        result = self.collect(request, "i53-credit-only-command")
        self.assertEqual(result, self.collect(request, "i53-credit-only-command"))
        self.assertIsNone(result["transaction_id"])
        self.assertIsNone(result["receipt_no"])
        self.assertIsNone(result["receipt_url"])
        self.assertEqual(result["cash_received"], "0.00")
        self.assertEqual([a["transaction_id"] for a in result["allocations"]], [self.split_payment_id, self.pure_payment_id])
        self.assertEqual([a["amount"] for a in result["allocations"]], ["200.00", "200.00"])
        self.assertEqual(self.snapshot()["fee_transactions"], before["fee_transactions"])
        totals = self.totals()
        self.assertEqual(totals["payment_count"], totals_before["payment_count"])
        self.assertEqual(totals["cash"], totals_before["cash"])
        self.assertEqual(totals["credit"], Decimal("100.00"))
        self.assertEqual(totals["paid"]-totals_before["paid"], Decimal("400.00"))
        with Session(self.engine) as db:
            self.assertEqual(db.query(FeeCollectionCommand).count(), 1)
        self.assert_reconciled()

    def test_false_default_blocks_unknown_future_rates_but_allows_existing_and_advance(self):
        self.upgrade()
        # A fixed synthetic future session makes this independent of today's year.
        with self.engine.begin() as connection:
            connection.execute(text("UPDATE academic_sessions SET end_date='2099-12-31' WHERE id=1"))
        with self.assertRaises(HTTPException) as failed:
            self.request(["2099-01"], amount="100.00")
        self.assertEqual(failed.exception.status_code, 409)
        existing = self.request(["2027-01"], amount="0.25")
        self.collect(existing, "i53-existing-future")
        advance = self.request([], period_type="advance_only", amount="100.00", retain_excess_as_credit=True)
        result = self.collect(advance, "i53-advance-payment")
        self.assertEqual(result["allocations"], [])
        self.assertEqual(result["new_advance_credit"], "100.00")
        with Session(self.engine) as db:
            db.query(FeeStructure).filter_by(id=1).one().rates_finalized = True
            db.commit()
        approved = self.request(["2099-01"], amount="100.00")
        self.assertEqual(self.collect(approved, "i53-final-future")["obligations"][0]["billing_period"], "2099-01")
        self.assert_reconciled()

    def test_command_constraints_reject_wrong_owners_duplicates_nulls_and_deleted_history(self):
        self.upgrade()
        statement = """INSERT INTO fee_collection_commands
            (organization_id,student_id,session_id,transaction_id,created_by,idempotency_key,request_fingerprint,response_snapshot)
            VALUES (:org,:student,:session,:payment,:actor,:key,:fingerprint,cast(:snapshot AS json))"""
        good = dict(org=1, student=1, session=1, payment=self.split_payment_id, actor=1,
                    key="command-constraint-key", fingerprint="a" * 64, snapshot="{}")
        with self.engine.begin() as connection:
            connection.execute(text(statement), good)
        attempts = (good, {**good, "key": "other-key", "org": 2},
                    {**good, "key": "other-key", "student": 2}, {**good, "key": "other-key", "session": 2},
                    {**good, "key": "other-key", "payment": 5}, {**good, "key": "other-key", "actor": 99999},
                    {**good, "key": "other-key", "snapshot": None}, {**good, "key": "other-key", "fingerprint": "short"},
                    {**good, "key": None}, {**good, "key": "x"*129})
        for values in attempts:
            with self.subTest(values=values), self.assertRaises((IntegrityError, __import__('sqlalchemy').exc.DataError)):
                with self.engine.begin() as connection:
                    connection.execute(text(statement), values)
        # The same key is legitimate for another organization; NULL payment is
        # legitimate for a credit-only command, but student/session FKs still apply.
        with self.engine.begin() as connection:
            connection.execute(text(statement), {**good, "org": 2, "student": 2, "session": 2, "payment": None})
        for sql in ("DELETE FROM fee_transactions WHERE id=:id", "DELETE FROM students WHERE id=1", "DELETE FROM academic_sessions WHERE id=1", "DELETE FROM users WHERE id=1"):
            with self.subTest(sql=sql), self.assertRaises(IntegrityError):
                with self.engine.begin() as connection:
                    connection.execute(text(sql), {"id": self.split_payment_id})

    def test_migration_revokes_supabase_style_default_grants_and_public_privileges(self):
        with self.engine.begin() as connection:
            connection.execute(text("""DO $roles$ BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
              IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
            END $roles$"""))
            connection.execute(text(f'ALTER DEFAULT PRIVILEGES IN SCHEMA "{self.schema}" GRANT ALL ON TABLES TO PUBLIC, anon, authenticated'))
            connection.execute(text(f'ALTER DEFAULT PRIVILEGES IN SCHEMA "{self.schema}" GRANT ALL ON SEQUENCES TO PUBLIC, anon, authenticated'))
        self.upgrade()
        with self.engine.connect() as connection:
            for role in ("anon", "authenticated"):
                for privilege in ("SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"):
                    self.assertFalse(connection.scalar(text("SELECT has_table_privilege(:role,'fee_collection_commands',:privilege)"), {"role": role, "privilege": privilege}))
                for privilege in ("USAGE", "SELECT", "UPDATE"):
                    self.assertFalse(connection.scalar(text("SELECT has_sequence_privilege(:role,'fee_collection_commands_id_seq',:privilege)"), {"role": role, "privilege": privilege}))
            for relation in ("fee_collection_commands", "fee_collection_commands_id_seq"):
                public_acl = connection.scalar(text("SELECT count(*) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid=cast(:relation AS regclass) AND a.grantee=0"), {"relation": relation})
                self.assertEqual(public_acl, 0)
        self.assertEqual(self.schema_audit()["policies"], [])

    def test_rls_denies_untrusted_role_even_if_direct_read_write_grants_are_added(self):
        self.upgrade()
        self.collect(self.request(["2026-06"], credit_amount="1.00"), "rls-rehearsal-command")
        with self.engine.connect() as connection:
            connection.execute(text("CREATE ROLE i53_untrusted NOLOGIN"))
            connection.execute(text(f'GRANT USAGE ON SCHEMA "{self.schema}" TO i53_untrusted'))
            connection.execute(text("GRANT SELECT, INSERT, UPDATE, DELETE ON fee_collection_commands TO i53_untrusted"))
            connection.execute(text("SET LOCAL ROLE i53_untrusted"))
            self.assertEqual(connection.scalar(text("SELECT count(*) FROM fee_collection_commands")), 0)
            self.assertEqual(connection.execute(text("UPDATE fee_collection_commands SET response_snapshot='{}'")).rowcount, 0)
            self.assertEqual(connection.execute(text("DELETE FROM fee_collection_commands")).rowcount, 0)
            with self.assertRaises(ProgrammingError):
                connection.execute(text("INSERT INTO fee_collection_commands (id,organization_id,student_id,session_id,created_by,idempotency_key,request_fingerprint,response_snapshot) VALUES (999,1,1,1,1,'forbidden-command',repeat('a',64),'{}')"))
            connection.rollback()

    def test_failure_after_ddl_rolls_back_schema_data_and_revision(self):
        before = self.snapshot()
        with patch.object(self.revision, "COMMAND_SECURITY_SQL", (*self.revision.COMMAND_SECURITY_SQL, "SELECT 1/0")):
            with self.assertRaises(__import__('sqlalchemy').exc.DataError):
                self.upgrade()
        self.assert_still_h42(before)
        self.upgrade()  # Failure must leave a retryable predecessor.
        self.assertEqual(before, self.snapshot())

    def test_conflicting_structure_lock_times_out_and_leaves_h42_unchanged(self):
        before = self.snapshot()
        with self.engine.connect() as blocker:
            blocker.execute(text("LOCK TABLE fee_structures IN ACCESS EXCLUSIVE MODE"))
            with self.assertRaises(OperationalError):
                self.upgrade()
            blocker.rollback()
        self.assert_still_h42(before)

    def test_current_single_month_api_fails_closed_before_i53_without_financial_writes(self):
        before = self.snapshot()
        with Session(self.engine) as db:
            with self.assertRaises(HTTPException) as failed:
                collect_fee_payment(db, self.actor, 1, Decimal("0.25"), "missing-i53-command")
            self.assertEqual(failed.exception.status_code, 503)
        self.assertEqual(before, self.snapshot())

    def test_downgrade_refuses_without_discarding_command_history(self):
        self.upgrade()
        self.collect(self.request(["2026-06"], credit_amount="1.00"), "downgrade-rehearsal")
        before = self.snapshot()
        with self.assertRaisesRegex(RuntimeError, "discard collection audit history"):
            with self.engine.begin() as connection:
                with Operations.context(MigrationContext.configure(connection)):
                    self.revision.downgrade()
        self.assertEqual(before, self.snapshot())
        with self.engine.connect() as connection:
            self.assertEqual(connection.scalar(text("SELECT count(*) FROM fee_collection_commands")), 1)
            self.assertEqual(connection.scalar(text("SELECT version_num FROM alembic_version")), "i53b92a4c186")

    def test_concurrent_credit_consumption_on_actual_migrated_schema(self):
        self.upgrade()
        requests = [self.request([month], credit_amount="400.00") for month in ("2026-04", "2026-06")]
        barrier = threading.Barrier(2)
        def collect(request, key):
            with Session(self.engine, autoflush=False) as db:
                db.query(FeeTransaction).all()
                barrier.wait(timeout=10)
                try:
                    return multi.collect_multi(db, self.actor, request, key)
                except HTTPException as exc:
                    return exc.status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(collect, request, f"migrated-credit-race-{i}") for i, request in enumerate(requests)]
            results = [f.result(timeout=30) for f in futures]
        self.assertEqual(sum(isinstance(r, dict) for r in results), 1)
        self.assertIn(409, results)
        totals = self.totals()
        self.assertEqual(totals["payment_count"], 7)
        self.assertEqual(totals["cash"], Decimal("4046.27"))
        self.assertEqual(totals["credit"], Decimal("100.00"))
        self.assert_reconciled()


if __name__ == "__main__":
    unittest.main()
