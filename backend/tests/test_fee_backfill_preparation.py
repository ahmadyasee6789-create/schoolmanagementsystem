"""Test read-only migration preparation, never upgrade/downgrade or Alembic DDL."""
import ast
from datetime import date
from decimal import Decimal
from pathlib import Path
import unittest

import sqlalchemy as sa

from app.db.fee_migration_v1 import FeeBackfillError, prepare_legacy_fee_backfill


class FeeBackfillPreparationTests(unittest.TestCase):
    def setUp(self):
        self.engine = sa.create_engine("sqlite://")
        self.addCleanup(self.engine.dispose)
        metadata = sa.MetaData()
        # Minimal predecessor-shaped tables with intentionally unenforced legacy
        # constraints, so malformed historical data can reach the preflight.
        self.records = {
            "academic_sessions": dict(id=1, organization_id=1, start_date=date(2026, 4, 1), end_date=date(2027, 3, 31)),
            "students": dict(id=1, organization_id=1),
            "classrooms": dict(id=1, organization_id=1, academic_year_id=1, grade_id=1),
            "grades": dict(id=1, organization_id=1),
            "student_enrollments": dict(id=1, student_id=1, session_id=1, enrollment_date=date(2026, 4, 1), withdrawal_date=None),
            "student_fees": dict(id=1, organization_id=1, student_id=1, class_id=1, session_id=1, month="January",
                                 discount_percent=Decimal("12.50"), status="partial", admission_fee=Decimal(0),
                                 monthly_fee=Decimal("1000.04"), exam_fee=Decimal(0), total_amount=Decimal("1000.04"),
                                 discount_amount=Decimal("125.01"), final_amount=Decimal("875.03"), paid_amount=Decimal("250.25")),
            "fee_transactions": dict(id=1, organization_id=1, student_fee_id=1, amount=Decimal("250.25"),
                                     receipt_no="LEGACY-RECEIPT", idempotency_key=None, paid_amount_after=None, fee_status_after=None),
        }
        self.tables = {}
        for name, row in self.records.items():
            columns = []
            for key, value in row.items():
                if key.endswith("_date"):
                    kind = sa.Date()
                elif isinstance(value, Decimal) or key == "paid_amount_after":
                    kind = sa.Numeric(14, 2)
                elif isinstance(value, int):
                    kind = sa.Integer()
                else:
                    kind = sa.String()
                columns.append(sa.Column(key, kind, primary_key=key == "id"))
            self.tables[name] = sa.Table(name, metadata, *columns)
        metadata.create_all(self.engine)
        self.connection = self.engine.connect()
        self.addCleanup(self.connection.close)
        for name, row in self.records.items():
            self.connection.execute(self.tables[name].insert(), row)
        self.connection.commit()

    def change(self, table, **values):
        self.connection.execute(self.tables[table].update().where(self.tables[table].c.id == 1).values(**values))
        self.connection.commit()

    def snapshot(self):
        return {name: self.connection.execute(sa.select(table).order_by(table.c.id)).all()
                for name, table in self.tables.items()}

    def refused(self, phrase):
        before = self.snapshot()
        with self.assertRaises(FeeBackfillError) as raised:
            prepare_legacy_fee_backfill(self.connection)
        self.assertIn(phrase, str(raised.exception))
        self.assertEqual(before, self.snapshot())
        return raised.exception.issues

    def test_backfill_uses_original_relationship_and_preserves_all_original_values(self):
        before = self.snapshot()
        plan = prepare_legacy_fee_backfill(self.connection)
        self.assertEqual(plan["periods"], [{"id": 1, "period": date(2027, 1, 1)}])
        self.assertEqual(plan["allocations"], [dict(transaction_id=1, student_fee_id=1, organization_id=1,
                                                   student_id=1, session_id=1, amount=Decimal("250.25"))])
        self.assertEqual(before, self.snapshot())

    def test_ambiguous_year_reports_fee_ids_instead_of_using_enrollment_to_guess(self):
        self.change("academic_sessions", end_date=date(2028, 3, 31))
        issues = self.refused("no unique year")
        self.assertIn({"table": "student_fees", "id": 1, "reason": "legacy month has no unique year in academic session"}, issues)

    def test_unsupported_legacy_month_is_not_normalized_silently(self):
        self.change("student_fees", month="Jan")
        self.refused("unsupported legacy month")

    def test_period_outside_enrollment_is_not_reassigned(self):
        self.change("student_enrollments", enrollment_date=date(2027, 2, 1))
        self.refused("does not overlap enrollment")

    def test_missing_enrollment_is_not_fabricated(self):
        self.connection.execute(self.tables["student_enrollments"].delete())
        self.connection.commit()
        self.refused("missing or duplicate student/session enrollment")

    def test_missing_payment_is_not_fabricated(self):
        self.connection.execute(self.tables["fee_transactions"].delete())
        self.connection.commit()
        self.refused("does not reconcile")

    def test_duplicate_monthly_charges_report_both_ids(self):
        duplicate = {**self.records["student_fees"], "id": 2, "paid_amount": Decimal(0), "status": "unpaid"}
        self.connection.execute(self.tables["student_fees"].insert(), duplicate)
        self.connection.commit()
        issues = self.refused("duplicate monthly obligation")
        self.assertEqual({i["id"] for i in issues if i["reason"] == "duplicate monthly obligation"}, {1, 2})

    def test_invalid_fee_and_payment_money_is_refused(self):
        self.change("student_fees", paid_amount=Decimal("900.00"))
        self.refused("inconsistent fee breakdown")
        self.change("student_fees", paid_amount=Decimal("250.25"))
        self.change("fee_transactions", amount=Decimal("-1"))
        self.refused("invalid monetary value")

    def test_cross_tenant_payment_is_not_reassigned(self):
        self.change("fee_transactions", organization_id=2)
        self.refused("cross-organization fee relationship")

    def test_fee_class_session_ownership_is_checked(self):
        self.change("classrooms", academic_year_id=2)
        self.refused("mismatched student/class/session/grade ownership")

    def test_duplicate_receipts_and_request_keys_are_reported(self):
        duplicate = {**self.records["fee_transactions"], "id": 2}
        self.connection.execute(self.tables["fee_transactions"].insert(), duplicate)
        self.connection.commit()
        self.refused("duplicate organization receipt")
        self.connection.execute(self.tables["fee_transactions"].update().where(self.tables["fee_transactions"].c.id == 2).values(receipt_no="OTHER"))
        self.connection.execute(self.tables["fee_transactions"].update().values(idempotency_key="same-key", paid_amount_after=Decimal("500.50"), fee_status_after="partial"))
        self.connection.commit()
        self.refused("duplicate organization idempotency key")

    def test_existing_key_requires_an_original_valid_snapshot(self):
        self.change("fee_transactions", idempotency_key="old-request")
        self.refused("invalid monetary value")

    def test_zero_net_obligation_without_payment_maps_without_a_fake_transaction(self):
        self.change("student_fees", discount_percent=Decimal(100), discount_amount=Decimal("1000.04"),
                    final_amount=Decimal(0), paid_amount=Decimal(0), status="paid")
        self.connection.execute(self.tables["fee_transactions"].delete())
        self.connection.commit()
        plan = prepare_legacy_fee_backfill(self.connection)
        self.assertEqual(len(plan["periods"]), 1)
        self.assertEqual(plan["allocations"], [])

    def test_revision_chain_is_single_and_new_revision_follows_integrity_revision(self):
        # Parse files without importing/executing any upgrade or downgrade code.
        versions = Path(__file__).resolve().parents[1] / "alembic" / "versions"
        parents = {}
        for path in versions.glob("*.py"):
            values = {}
            for statement in ast.parse(path.read_text(encoding="utf-8")).body:
                targets = statement.targets if isinstance(statement, ast.Assign) else [statement.target] if isinstance(statement, ast.AnnAssign) else []
                for target in targets:
                    if isinstance(target, ast.Name) and target.id in ("revision", "down_revision"):
                        values[target.id] = ast.literal_eval(statement.value)
            if "revision" in values:
                parents[values["revision"]] = values["down_revision"]
        self.assertEqual(parents["h42a81f3b075"], "g31f70e2a964")
        self.assertEqual(parents["i53b92a4c186"], "h42a81f3b075")
        self.assertEqual(parents["j64c03d5e297"], "i53b92a4c186")
        self.assertEqual(set(parents) - set(parents.values()), {"j64c03d5e297"})
        self.assertEqual(sum(parent is None for parent in parents.values()), 1)
