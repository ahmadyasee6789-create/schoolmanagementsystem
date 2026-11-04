"""Phase 2 functional/API regressions; synthetic in-memory database only."""
from datetime import date
from decimal import Decimal
from io import BytesIO
from unittest.mock import patch
import unittest

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from PIL import Image
from pydantic import ValidationError
from sqlalchemy import event, func

import test_fee_integrity as legacy
from app.models.academic_session import AcademicSession
from app.models.fee_allocation import FeeAllocation
from app.models.fee_collection_command import FeeCollectionCommand
from app.models.fee_yearly_discount import FeeYearlyDiscount
from app.models.fee_structure import FeeStructure
from app.models.fee_transection import FeeTransaction
from app.models.student_enrollment import StudentEnrollment
from app.models.student_fee import StudentFee
from app.models.users import Organization
from app.schemas.fee_collection import CollectionPreviewRequest, CollectionRequest
from app.services import multi_fee_collection as multi
from app.services.fee_allocations import remaining_credit
from app.services.fee_collection import collect_fee_payment
from app.services.fee_reads import student_fee_history, student_payments, receipt_info
from app.routers.receptTemp import render_multi_fee_receipt


class MultiFeeTests(unittest.TestCase):
    def setUp(self):
        legacy.FeeIntegrityTests.setUp(self)
        self.db.autoflush = False
        structure = self.db.query(FeeStructure).one()
        structure.monthly_fee, structure.admission_fee, structure.exam_fee = Decimal(700), Decimal(50), Decimal(20)
        self.db.query(StudentEnrollment).one().discount_percent = Decimal(0)
        self.db.commit()

    def preview(self, months=None, **values):
        payload = dict(student_id=1, session_id=1, billing_periods=months if months is not None else ["2026-10"])
        payload.update(values)
        request = CollectionPreviewRequest(**payload)
        return request, multi.preview_collection(self.db, self.actor, request)

    def confirm(self, request, preview, key="multi-payment-001"):
        return multi.collect_multi(self.db, self.actor, CollectionRequest(**request.model_dump(), preview_id=preview["preview_id"]), key)

    def collect(self, months=None, key="multi-payment-001", **values):
        request, preview = self.preview(months, **values)
        return self.confirm(request, preview, key)

    def advance(self, amount="5000.00", key="advance-payment-001"):
        return self.collect([], key=key, period_type="advance_only", amount=amount, retain_excess_as_credit=True, payment_method="cash")

    def assert_integrity(self):
        for fee in self.db.query(StudentFee).all():
            total = self.db.query(func.coalesce(func.sum(FeeAllocation.amount), 0)).filter_by(student_fee_id=fee.id).scalar()
            self.assertEqual(fee.paid_amount, total)
            self.assertLessEqual(fee.paid_amount, fee.final_amount)
        for payment in self.db.query(FeeTransaction).all():
            self.assertGreaterEqual(remaining_credit(self.db, payment), 0)

    def test_preview_is_read_only_even_with_autoflush_enabled(self):
        self.db.autoflush = True
        writes = []
        def capture(conn, cursor, statement, parameters, context, executemany):
            if statement.lstrip().split()[0].upper() in {"INSERT", "UPDATE", "DELETE"}:
                writes.append(statement)
        event.listen(self.engine, "before_cursor_execute", capture)
        self.addCleanup(event.remove, self.engine, "before_cursor_execute", capture)
        _, result = self.preview(["2026-10", "2026-11", "2026-12"], period_type="quarterly")
        self.assertEqual(result["total_payable"], "2100.00")
        self.assertEqual([f["billing_period"] for f in result["previous_dues"]], ["2026-04"])
        self.assertEqual(self.db.query(StudentFee).count(), 1)
        self.assertEqual(writes, [])

    def test_quarterly_creates_three_fees_one_payment(self):
        result = self.collect(["2026-10", "2026-11", "2026-12"], period_type="quarterly", amount="2100.00")
        self.assertEqual(len(result["allocations"]), 3)
        self.assertEqual(self.db.query(FeeTransaction).count(), 1)
        self.assertEqual([f["status"] for f in result["obligations"]], ["paid"] * 3)
        self.assertEqual(self.db.get(StudentFee, 1).paid_amount, 0)
        self.assert_integrity()

    def test_half_year_partial_spanning_december_january(self):
        months = ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]
        result = self.collect(months, period_type="half_yearly", amount="2000.00")
        self.assertEqual([f["status"] for f in result["obligations"]], ["paid", "paid", "partial", "unpaid", "unpaid", "unpaid"])
        self.assertEqual(result["obligations"][2]["outstanding"], "100.00")
        self.assertEqual(sum(Decimal(a["amount"]) for a in result["allocations"]), Decimal(2000))
        info = receipt_info(self.db, self.actor, result["transaction_id"])
        self.assertEqual(info["cash_received"], "2000.00")
        self.assertEqual(sum(Decimal(f["outstanding"]) for f in info["obligations"]), Decimal("2200.00"))
        self.assertEqual(self.db.query(FeeTransaction).count(), 1)
        self.assert_integrity()

    def test_half_year_full_then_generation_does_not_duplicate(self):
        months = ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]
        result = self.collect(months, period_type="half_yearly", amount="4200.00")
        self.assertEqual([line["status"] for line in result["obligations"]], ["paid"] * 6)
        self.assertEqual(len(result["allocations"]), 6)
        for month in ("October", "November", "December", "January", "February", "March"):
            legacy.routes.generate_monthly_fees(1, month, False, self.db, self.actor, self.session)
        self.assertEqual(self.db.query(StudentFee).count(), 7)  # Includes the fixture's April fee.
        self.assertEqual(self.db.query(FeeTransaction).count(), 1)
        self.assert_integrity()

    def test_yearly_uses_existing_snapshot_and_only_missing_months(self):
        months = [f"2026-{m:02d}" for m in range(4, 13)] + ["2027-01", "2027-02", "2027-03"]
        result = self.collect(months, period_type="yearly", amount="8700.00")
        self.assertEqual(self.db.query(StudentFee).count(), 12)
        self.assertEqual(result["obligations"][0]["monthly_fee"], "1000.00")
        self.assertEqual(result["obligations"][0]["generated"], False)
        self.assert_integrity()

    def test_approved_yearly_discount_is_tuition_only_full_settlement_and_audited(self):
        self.actor.org_role = "manager"
        months = [f"2026-{m:02d}" for m in range(4, 13)] + ["2027-01", "2027-02", "2027-03"]
        request, preview = self.preview(months, period_type="yearly", yearly_discount_percent="10.00", amount="7830.00")
        self.assertEqual(preview["total_payable"], "7830.00")
        self.assertEqual(sum(Decimal(line["yearly_discount_amount"]) for line in preview["obligations"]), Decimal("870.00"))
        result = self.confirm(request, preview, "yearly-discount-001")
        self.assertEqual(self.db.query(FeeYearlyDiscount).count(), 12)
        self.assertEqual(sum(f.final_amount for f in self.db.query(StudentFee).all()), Decimal("8700.00"))
        self.assertEqual(sum(f.paid_amount for f in self.db.query(StudentFee).all()), Decimal("7830.00"))
        self.assertEqual({fee.status for fee in self.db.query(StudentFee)}, {"paid"})
        self.assertEqual(sum(Decimal(line["yearly_discount_amount"]) for line in result["obligations"]), Decimal("870.00"))
        receipt = receipt_info(self.db, self.actor, result["transaction_id"])
        self.assertEqual(sum(Decimal(line["yearly_discount_amount"]) for line in receipt["obligations"]), Decimal("870.00"))
        self.assertEqual(render_multi_fee_receipt(receipt)[:4], b"%PDF")
        history = student_fee_history(self.db, self.actor, 1)
        self.assertEqual(history["sessions"][0]["outstanding"], "0.00")
        self.assertEqual(history["sessions"][0]["yearly_discount"], "870.00")
        self.assertFalse(any(line["overdue"] for line in history["items"]))
        from app.routers.reports import get_fee_report
        report = get_fee_report(None, None, "paid", self.db, self.actor, self.session)
        self.assertEqual((report.total, report.total_billed, report.total_paid, report.total_pending), (12, 7830, 7830, 0))
        with self.assertRaises(HTTPException) as partial:
            self.preview(months, period_type="yearly", yearly_discount_percent="10.00", amount="7000.00")
        self.assertEqual(partial.exception.status_code, 422)
        self.assert_integrity()

    def test_yearly_quote_layers_discounts_and_preserves_paid_month_and_optional_heads(self):
        months = [f"2026-{m:02d}" for m in range(4, 13)] + ["2027-01", "2027-02", "2027-03"]
        self.db.query(StudentEnrollment).one().discount_percent = Decimal("10")
        self.db.commit()
        existing = collect_fee_payment(self.db, self.actor, 1, Decimal("1000"), "earlier-paid-001")
        fields = dict(period_type="yearly", yearly_discount_percent="10", admission_period="2026-05",
                      exam_periods=["2026-06"])
        with self.assertRaises(HTTPException) as denied:
            self.preview(months, **fields)
        self.assertEqual(denied.exception.status_code, 403)
        self.actor.org_role = "admin"
        _, quote = self.preview(months, **fields)
        self.assertEqual(quote["total_payable"], "6307.00")
        self.assertEqual(quote["obligations"][0]["yearly_discount_amount"], "0.00")
        self.assertEqual(quote["obligations"][1]["yearly_discount_amount"], "63.00")
        self.assertEqual(quote["obligations"][1]["outstanding"], "617.00")
        self.assertEqual(quote["obligations"][2]["outstanding"], "587.00")
        with self.assertRaises(HTTPException) as partial:
            self.preview(months, amount="6306.99", **fields)
        self.assertEqual(partial.exception.status_code, 422)
        result = self.collect(months, amount=quote["total_payable"], **fields)
        self.assertEqual(result["obligations"][0]["paid_amount"], "1000.00")
        self.assertEqual(self.db.get(FeeTransaction, existing["transaction_id"]).amount, Decimal("1000"))
        self.assertEqual(self.db.query(FeeYearlyDiscount).count(), 11)
        self.assert_integrity()

    def test_old_phase2_confirmation_fingerprint_remains_replayable(self):
        request, preview = self.preview(amount="700.00")
        result = self.confirm(request, preview)
        legacy_request = CollectionRequest(**request.model_dump(), preview_id=preview["preview_id"])
        command = self.db.query(FeeCollectionCommand).one()
        command.request_fingerprint = multi.digest({
            "v": 2, "operation": "multi",
            "request": legacy_request.model_dump(mode="json", exclude={"yearly_discount_percent"}),
        })
        self.db.commit()
        self.assertEqual(self.confirm(request, preview), result)
        self.assertEqual(self.db.query(FeeTransaction).count(), 1)

    def test_ledger_projects_yearly_adjustments_from_unchanged_fee_snapshots(self):
        self.actor.org_role = "admin"
        self.db.query(StudentEnrollment).one().discount_percent = Decimal("12.50")
        self.db.commit()
        months = [f"2026-{m:02d}" for m in range(4, 13)] + ["2027-01", "2027-02", "2027-03"]
        fields = dict(period_type="yearly", yearly_discount_percent="10.00", exam_periods=["2026-05"])
        _, quote = self.preview(months, **fields)
        self.collect(months, amount=quote["total_payable"], **fields)

        result = legacy.routes.get_fee_ledger(1, "May", 1, 10, self.db, self.actor, self.session)
        self.assertEqual(result["total_pages"], 1)
        self.assertEqual(len(result["items"]), 1)
        row = result["items"][0]
        self.assertEqual(
            (row["total_amount"], row["discount_amount"], row["yearly_discount_amount"],
             row["final_amount"], row["paid_amount"], row["due_amount"], row["status"]),
            (720, 87.50, 61.25, 571.25, 571.25, 0, "paid"),
        )
        stored_fee = self.db.get(StudentFee, row["id"])
        self.assertEqual(stored_fee.final_amount, Decimal("632.50"))
        self.assertEqual(stored_fee.discount_amount, Decimal("87.50"))
        self.assert_integrity()

    def test_ledger_keeps_monthly_partial_balance_and_displays_zero_cash_yearly_months(self):
        self.collect(["2026-04"], period_type="monthly", amount="40.25")
        row = legacy.routes.get_fee_ledger(1, "April", 1, 10, self.db, self.actor, self.session)["items"][0]
        self.assertEqual(
            (row["yearly_discount_amount"], row["final_amount"], row["paid_amount"], row["due_amount"], row["status"]),
            (0, 1000, 40.25, 959.75, "partial"),
        )

        self.actor.org_role = "admin"
        months = [f"2026-{m:02d}" for m in range(4, 13)] + ["2027-01", "2027-02", "2027-03"]
        self.collect(months, period_type="yearly", yearly_discount_percent="100.00", exam_periods=["2026-05"],
                     amount="20.00", key="yearly-zero-cash-month")
        row = legacy.routes.get_fee_ledger(1, "June", 1, 10, self.db, self.actor, self.session)["items"][0]
        self.assertEqual(
            (row["yearly_discount_amount"], row["final_amount"], row["paid_amount"], row["due_amount"], row["status"]),
            (700, 0, 0, 0, "paid"),
        )
        self.assert_integrity()

    def test_custom_nonconsecutive_does_not_generate_gaps(self):
        result = self.collect(["2026-10", "2027-02"], amount="1400.00")
        self.assertEqual(self.db.query(StudentFee).count(), 3)
        self.assertEqual([a["billing_period"] for a in result["allocations"]], ["2026-10", "2027-02"])

    def test_existing_partial_and_paid_fees_are_not_repriced_or_overpaid(self):
        collect_fee_payment(self.db, self.actor, 1, Decimal(600), "legacy-first-001")
        result = self.collect(["2026-04", "2026-05"], amount="1100.00")
        self.assertEqual([a["amount"] for a in result["allocations"]], ["400.00", "700.00"])
        result = self.collect(["2026-04", "2026-06"], key="multi-next-002", amount="700.00")
        self.assertEqual(len(result["allocations"]), 1)
        self.assert_integrity()

    def test_advance_credit_creation_and_credit_only_consumption(self):
        first = self.collect(["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"],
                             amount="5000.00", retain_excess_as_credit=True)
        self.assertEqual(first["new_advance_credit"], "800.00")
        request, preview = self.preview(["2026-05"], credit_amount="700.00")
        second = self.confirm(request, preview, "credit-only-001")
        self.assertIsNone(second["transaction_id"])
        self.assertIsNone(second["receipt_url"])
        self.assertEqual(second["remaining_advance_credit"], "100.00")
        self.assertEqual(self.confirm(request, preview, "credit-only-001"), second)
        self.assertEqual(self.db.query(FeeTransaction).count(), 1)
        self.assertEqual(self.db.query(FeeCollectionCommand).count(), 2)
        self.assert_integrity()

    def test_advance_only_works_without_structure_and_creates_no_fees(self):
        self.db.delete(self.db.query(FeeStructure).one())
        self.db.commit()
        result = self.advance()
        self.assertEqual(result["new_advance_credit"], "5000.00")
        self.assertEqual(result["allocations"], [])
        self.assertEqual(self.db.query(StudentFee).count(), 1)
        self.assertEqual(self.db.query(FeeAllocation).count(), 0)

    def test_credit_is_used_oldest_first_and_cash_only_for_remaining(self):
        one = self.advance("200.00")
        two = self.advance("300.00", key="advance-payment-002")
        result = self.collect(["2026-10"], amount="200.00", credit_amount="500.00")
        self.assertEqual([a["transaction_id"] for a in result["allocations"]], [one["transaction_id"], two["transaction_id"], result["transaction_id"]])
        self.assertEqual([a["amount"] for a in result["allocations"]], ["200.00", "300.00", "200.00"])
        self.assert_integrity()

    def test_cash_replay_and_conflict(self):
        request, preview = self.preview(amount="300.00")
        first = self.confirm(request, preview)
        self.assertEqual(first, self.confirm(request, preview))
        changed = request.model_copy(update={"amount": Decimal(400)})
        with self.assertRaises(HTTPException) as failed:
            self.confirm(changed, preview)
        self.assertEqual(failed.exception.status_code, 409)
        self.assertEqual(self.db.query(FeeTransaction).count(), 1)

    def test_keys_cannot_be_reused_across_single_multi_or_credit_commands(self):
        self.advance()
        self.collect(["2026-04"], key="shared-key-001", credit_amount="100.00")
        with self.assertRaises(HTTPException) as failed:
            collect_fee_payment(self.db, self.actor, 1, Decimal(100), "shared-key-001")
        self.assertEqual(failed.exception.status_code, 409)
        collect_fee_payment(self.db, self.actor, 1, Decimal(100), "legacy-key-001")
        request, preview = self.preview(["2026-04"], amount="100.00")
        with self.assertRaises(HTTPException) as failed:
            self.confirm(request, preview, "legacy-key-001")
        self.assertEqual(failed.exception.status_code, 409)

    def test_stale_balance_requires_fresh_preview_without_creating_fees(self):
        request, preview = self.preview(["2026-04", "2026-10"], amount="500.00")
        collect_fee_payment(self.db, self.actor, 1, Decimal(100), "intervening-001")
        with self.assertRaises(HTTPException) as failed:
            self.confirm(request, preview)
        self.assertEqual(failed.exception.status_code, 409)
        self.assertEqual(self.db.query(StudentFee).count(), 1)

    def test_stale_price_discount_or_enrollment_requires_fresh_preview(self):
        for attr, new in (("monthly_fee", Decimal(701)), ("discount_percent", Decimal(10)), ("enrollment_date", date(2026, 5, 1))):
            with self.subTest(attr=attr):
                request, preview = self.preview(amount="100.00")
                record = self.db.query(FeeStructure if attr == "monthly_fee" else StudentEnrollment).one()
                setattr(record, attr, new)
                self.db.commit()
                with self.assertRaises(HTTPException) as failed:
                    self.confirm(request, preview)
                self.assertEqual(failed.exception.status_code, 409)

    def test_discount_rounding_and_optional_heads(self):
        structure = self.db.query(FeeStructure).one()
        structure.monthly_fee = Decimal("1000.04")
        self.db.query(StudentEnrollment).one().discount_percent = Decimal("12.50")
        self.db.commit()
        request, preview = self.preview(["2026-10", "2026-11"], admission_period="2026-10", exam_periods=["2026-11"], amount="1820.06")
        self.assertEqual([f["discount_amount"] for f in preview["obligations"]], ["125.01", "125.01"])
        result = self.confirm(request, preview)
        self.assertEqual([f["admission_fee"] for f in result["obligations"]], ["50.00", "0.00"])
        self.assertEqual([f["exam_fee"] for f in result["obligations"]], ["0.00", "20.00"])
        with self.assertRaises(HTTPException):
            self.preview(["2026-12"], admission_period="2026-12")

    def test_issued_fee_heads_cannot_be_silently_added(self):
        for field in ({"admission_period": "2026-04"}, {"exam_periods": ["2026-04"]}):
            with self.subTest(field=field), self.assertRaises(HTTPException):
                self.preview(["2026-04"], **field)

    def test_future_provisional_rates_reject_generation_allow_advance(self):
        self.session.end_date = date(2099, 12, 31)
        self.db.query(FeeStructure).one().rates_finalized = False
        self.db.commit()
        with self.assertRaises(HTTPException) as failed:
            self.preview(["2099-01"])
        self.assertEqual(failed.exception.status_code, 409)
        self.advance()

    def test_rate_confirmation_authorization_and_issued_obligation(self):
        from app.routers.fee_structure import get_all_fee_structures, update_fee_structure
        from app.schemas.fee_structure import FeeStructureUpdate
        self.session.end_date = date(2099, 12, 31)
        self.db.commit()
        self.collect(["2099-01"], amount="100.00")
        structure = self.db.query(FeeStructure).one()
        structure.rates_finalized = False
        self.db.commit()
        self.assertFalse(get_all_fee_structures(self.db, self.actor, self.session)[0]["rates_finalized"])
        self.assertEqual(self.preview(["2099-01"])[1]["total_payable"], "600.00")
        with self.assertRaises(HTTPException) as blocked:
            self.preview(["2099-02"])
        self.assertEqual(blocked.exception.status_code, 409)
        data = FeeStructureUpdate(class_id=1, session_id=1, monthly_fee="700", rates_finalized=True)
        with self.assertRaises(HTTPException) as denied:
            update_fee_structure(structure.id, data, self.db, self.actor)
        self.assertEqual(denied.exception.status_code, 403)
        self.actor.org_role = "admin"
        self.assertTrue(update_fee_structure(structure.id, data, self.db, self.actor)["rates_finalized"])
        self.assertEqual(self.preview(["2099-02"])[1]["total_payable"], "700.00")

    def test_voucher_does_not_include_settled_yearly_discounts_as_arrears(self):
        from app.routers import fee_voucher
        self.actor.org_role = "admin"
        self.session.end_date = date(2027, 4, 30)
        self.db.commit()
        months = [f"2026-{m:02d}" for m in range(4, 13)] + ["2027-01", "2027-02", "2027-03"]
        result = self.collect(months, period_type="yearly", yearly_discount_percent="10.00", amount="7830.00")
        first_fee_id = result["obligations"][0]["fee_id"]
        with self.assertRaises(HTTPException) as settled:
            fee_voucher._single_voucher_pdf(first_fee_id, date(2027, 4, 10), self.db, self.actor, self.session)
        self.assertEqual(settled.exception.status_code, 409)
        fee, _ = multi.get_or_create_monthly_fee(self.db, org_id=1, student_id=1, session_id=1,
                                                period=date(2027, 4, 1), include_admission_fee=False)
        self.db.commit()
        with patch.object(fee_voucher, "generate_fee_voucher", wraps=fee_voucher.generate_fee_voucher) as render:
            response = fee_voucher._single_voucher_pdf(fee.id, date(2027, 4, 10), self.db, self.actor, self.session)
        self.assertEqual(response.media_type, "application/pdf")
        self.assertEqual(render.call_args.kwargs["voucher"]["arrears"], Decimal("0.00"))

    def test_session_and_enrollment_boundaries_are_not_truncated(self):
        for months in (["2027-03", "2027-04", "2027-05"], ["2026-03"]):
            with self.subTest(months=months), self.assertRaises(HTTPException):
                self.preview(months)
        self.db.query(StudentEnrollment).one().withdrawal_date = date(2026, 9, 30)
        self.db.commit()
        with self.assertRaises(HTTPException):
            self.preview(["2026-10"])

    def test_zero_discount_free_month_and_paid_month_need_no_allocation(self):
        self.db.query(StudentEnrollment).one().discount_percent = Decimal(100)
        self.db.commit()
        result = self.collect(["2026-10"], amount="1.00", retain_excess_as_credit=True)
        self.assertEqual(result["obligations"][0]["status"], "paid")
        self.assertEqual(result["allocations"], [])
        self.assertEqual(result["new_advance_credit"], "1.00")

    def test_rollback_after_second_allocation_failure(self):
        request, preview = self.preview(["2026-10", "2026-11"], amount="1400.00")
        original = multi.allocate_payment
        calls = 0
        def fail_second(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise RuntimeError("injected allocation failure")
            return original(*args, **kwargs)
        with patch.object(multi, "allocate_payment", side_effect=fail_second), self.assertRaises(RuntimeError):
            self.confirm(request, preview)
        self.assertEqual(self.db.query(StudentFee).count(), 1)
        self.assertEqual(self.db.query(FeeTransaction).count(), 0)
        self.assertEqual(self.db.query(FeeAllocation).count(), 0)
        self.assertEqual(self.db.query(FeeCollectionCommand).count(), 0)
        self.confirm(request, preview)
        self.assert_integrity()

    def test_excess_cash_credit_overuse_and_zero_collection_rejected(self):
        for values in ({"amount": "700.01"}, {"credit_amount": "1.00"}):
            with self.subTest(values=values), self.assertRaises(HTTPException):
                self.preview(**values)
        request, preview = self.preview()
        with self.assertRaises(HTTPException):
            self.confirm(request, preview)
        self.advance("1000.00")
        with self.assertRaises(HTTPException):
            self.preview(credit_amount="700.01")

    def test_organization_and_role_isolation_on_preview_collection_and_reads(self):
        request, preview = self.preview(amount="100.00")
        payment = self.confirm(request, preview)
        self.actor.org_id = 2
        for operation in (lambda: multi.preview_collection(self.db, self.actor, request),
                          lambda: self.confirm(request, preview),
                          lambda: student_fee_history(self.db, self.actor, 1),
                          lambda: receipt_info(self.db, self.actor, payment["transaction_id"])):
            with self.assertRaises(HTTPException) as failed:
                operation()
            self.assertEqual(failed.exception.status_code, 404)
        self.actor.org_id, self.actor.org_role = 1, "teacher"
        with self.assertRaises(HTTPException) as failed:
            self.preview()
        self.assertEqual(failed.exception.status_code, 403)

    def test_receipt_is_frozen_after_later_credit_consumption(self):
        first = self.advance("1000.00")
        before = receipt_info(self.db, self.actor, first["transaction_id"])
        self.collect(credit_amount="700.00")
        self.assertEqual(before, receipt_info(self.db, self.actor, first["transaction_id"]))
        self.assertEqual(before["remaining_advance_credit"], "1000.00")
        history = student_payments(self.db, self.actor, 1)
        self.assertEqual(history["items"][0]["available_credit"], "300.00")
        self.assertEqual(len(history["items"][0]["allocations"]), 1)

    def test_history_future_prepaid_not_overdue_and_credit_not_revenue(self):
        self.advance("1500.00")
        self.collect(["2027-03"], credit_amount="700.00")
        history = student_fee_history(self.db, self.actor, 1)
        self.assertEqual(history["sessions"][0]["cash_received"], "1500.00")
        self.assertEqual(history["sessions"][0]["paid"], "700.00")
        self.assertEqual(history["sessions"][0]["available_credit"], "800.00")
        self.assertFalse(history["items"][-1]["overdue"])

    def test_dashboard_counts_new_cash_once_after_existing_credit_application(self):
        from app.models.users import OrganizationMember
        from app.routers import dashboard
        self.db.add(OrganizationMember(user_id=1, organization_id=1, role="accountant"))
        self.db.commit()
        self.advance("5000.00")
        self.collect(["2026-10", "2026-11", "2026-12"], credit_amount="2100.00")
        self.collect(["2027-01", "2027-02"], key="second-credit-001", credit_amount="1400.00")
        with patch.object(dashboard.redis_client, "get", return_value=None), patch.object(dashboard.redis_client, "set"):
            result = dashboard.get_dashboard_stats(self.db, self.actor, self.session)
        self.assertEqual(result["financials"]["revenue"]["yearTotal"], 5000)

    def test_report_retains_withdrawn_students_and_marks_future_balances(self):
        from app.routers.reports import get_fee_report
        self.collect(["2027-03"], amount="100.00")
        self.db.query(StudentEnrollment).one().is_active = False
        self.db.commit()
        report = get_fee_report(None, None, None, self.db, self.actor, self.session)
        self.assertEqual(report.total, 2)
        future = next(f for f in report.items if f.billing_period == "2027-03")
        self.assertFalse(future.overdue)
        self.assertEqual(report.total_billed, 1700)
        self.assertEqual(report.total_paid, 100)
        self.assertEqual(report.total_pending, 1600)
        self.assertEqual(report.total_overdue, 1000)

    def test_cross_session_credit_is_never_consumed_and_previous_history_remains_available(self):
        from app.models.classroom import Classroom
        self.advance("1000.00")
        self.db.add(AcademicSession(id=3, organization_id=1, name="2027-28", start_date=date(2027, 4, 1), end_date=date(2028, 3, 31)))
        self.db.flush()
        self.db.add(Classroom(id=3, organization_id=1, grade_id=1, section="B", academic_year_id=3))
        self.db.flush()
        self.db.add(StudentEnrollment(student_id=1, session_id=3, classroom_id=3, enrollment_date=date(2027, 4, 1), is_active=True))
        self.db.add(FeeStructure(organization_id=1, session_id=3, class_id=3, admission_fee=0, monthly_fee=700, exam_fee=0, rates_finalized=True))
        self.db.commit()
        with self.assertRaises(HTTPException):
            self.preview(["2027-04"], session_id=3, credit_amount="700.00")
        self.collect(["2027-04"], session_id=3, amount="100.00")
        old = student_fee_history(self.db, self.actor, 1, session_id=1)
        new = student_fee_history(self.db, self.actor, 1, session_id=3)
        self.assertEqual(old["sessions"][0]["available_credit"], "1000.00")
        self.assertEqual(new["sessions"][0]["available_credit"], "0.00")
        self.assertEqual(len(student_fee_history(self.db, self.actor, 1)["sessions"]), 2)

    def test_api_contract_and_pdf_paths(self):
        app = FastAPI()
        app.include_router(legacy.routes.router)
        app.dependency_overrides[legacy.routes.get_db] = lambda: self.db
        app.dependency_overrides[legacy.routes.get_current_user] = lambda: self.actor
        with TestClient(app) as client:
            payload = dict(student_id=1, session_id=1, billing_periods=["2026-10"], amount="700.00", payment_method="cash")
            preview = client.post("/fees/collection/preview", json=payload)
            self.assertEqual(preview.status_code, 200, preview.text)
            result = client.post("/fees/collection/multi", json={**payload, "preview_id": preview.json()["preview_id"]}, headers={"Idempotency-Key": "api-multi-001"})
            self.assertEqual(result.status_code, 200, result.text)
            info = result.json()
            self.assertEqual(client.get(info["receipt_url"]).content[:4], b"%PDF")
            self.assertEqual(client.get(f'/fees/payments/{info["transaction_id"]}/receipt-info').status_code, 200)
            self.assertEqual(client.get('/fees/students/1/history').status_code, 200)
            self.assertEqual(client.get('/fees/students/1/payments').status_code, 200)
            self.assertEqual(client.get(f'/fees/payments/{info["transaction_id"]}').status_code, 200)
            with patch.object(legacy.routes, "render_multi_fee_receipt", side_effect=RuntimeError("renderer offline")):
                self.assertEqual(client.get(info["receipt_url"]).status_code, 503)
            self.assertEqual(self.db.query(FeeTransaction).count(), 1)

    def test_receipt_logo_is_organization_scoped_and_legacy_pdf_is_unchanged(self):
        output = BytesIO()
        Image.new("RGB", (160, 90), "#204b75").save(output, format="PNG")
        logo = output.getvalue()
        self.db.get(Organization, 2).logo = logo
        self.db.commit()
        multi_payment = self.collect(["2026-10", "2026-11", "2026-12"], period_type="quarterly", amount="2100.00")
        legacy_payment = collect_fee_payment(self.db, self.actor, 1, Decimal("100"), "legacy-logo-test-001")
        legacy_url = f'/fees/payments/{legacy_payment["transaction_id"]}/receipt'
        app = FastAPI()
        app.include_router(legacy.routes.router)
        app.dependency_overrides[legacy.routes.get_db] = lambda: self.db
        app.dependency_overrides[legacy.routes.get_current_user] = lambda: self.actor

        with TestClient(app) as client:
            plain = client.get(multi_payment["receipt_url"])
            self.assertEqual(plain.status_code, 200)
            self.assertNotIn(b"/Subtype /Image", plain.content)

            self.db.get(Organization, 1).logo = logo
            self.db.commit()
            before = receipt_info(self.db, self.actor, multi_payment["transaction_id"])
            branded = client.get(multi_payment["receipt_url"])
            self.assertEqual(branded.status_code, 200)
            self.assertEqual(branded.headers["content-type"], "application/pdf")
            self.assertIn(b"/Subtype /Image", branded.content)
            legacy_receipt = client.get(legacy_url)
            self.assertEqual(legacy_receipt.status_code, 200)
            self.assertNotIn(b"/Subtype /Image", legacy_receipt.content)
            self.assertEqual(receipt_info(self.db, self.actor, multi_payment["transaction_id"]), before)
            self.assertEqual(self.db.query(FeeTransaction).count(), 2)


class SelectionValidationTests(unittest.TestCase):
    def test_bad_selections_and_money_fail_before_any_database_access(self):
        for values in ({"billing_periods": ["2026-10", "2026-10"]}, {"billing_periods": ["2026-11", "2026-10"]},
                       {"billing_periods": ["0000-01"]}, {"billing_periods": ["2026-13"]},
                       {"period_type": "quarterly", "billing_periods": ["2026-10", "2026-12", "2027-01"]},
                       {"period_type": "yearly", "billing_periods": ["2026-10"]},
                       {"admission_period": "2026-11"}, {"exam_periods": ["2026-11"]}, {"transport_fee": 10},
                       {"amount": True}, {"amount": "1.001"}, {"amount": "NaN"}, {"amount": "-1"},
                       {"credit_amount": "Infinity"}, {"billing_periods": []}, {"payment_method": "cash"},
                       {"student_id": True}, {"retain_excess_as_credit": "false"}):
            payload = dict(student_id=1, session_id=1, billing_periods=["2026-10"])
            payload.update(values)
            with self.subTest(values=values), self.assertRaises(ValidationError):
                CollectionPreviewRequest(**payload)


if __name__ == "__main__":
    unittest.main()
