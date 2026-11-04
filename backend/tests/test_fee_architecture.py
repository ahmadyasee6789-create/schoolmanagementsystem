"""Phase 1 architecture, synthetic in-memory data; no migrations are executed."""
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import event, func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

import test_fee_integrity as legacy
from app.models.academic_session import AcademicSession
from app.models.fee_allocation import FeeAllocation
from app.models.fee_structure import FeeStructure
from app.models.fee_transection import FeeTransaction
from app.models.student_enrollment import StudentEnrollment
from app.models.student_fee import StudentFee
from app.models.students import Student
from app.models.users import OrganizationMember
from app.services.billing_periods import resolve_legacy_month, validate_period
from app.services.fee_allocations import allocate_payment, remaining_credit, reconciled_fee_balance
from app.services.fee_collection import collect_fee_payment, lock_financial_organization
from app.services.monthly_fees import calculate_monthly_charge, get_or_create_monthly_fee


class BillingPeriodTests(unittest.TestCase):
    def test_session_rollover_uses_session_year_not_current_year(self):
        self.assertEqual(resolve_legacy_month("January", date(2026, 4, 1), date(2027, 3, 31)), date(2027, 1, 1))
        self.assertEqual(resolve_legacy_month("December", date(2026, 4, 1), date(2027, 3, 31)), date(2026, 12, 1))

    def test_ambiguous_missing_and_invalid_periods_are_rejected(self):
        for month, start, end in (("April", date(2026, 4, 1), date(2027, 4, 30)),
                                  ("April", date(2026, 5, 1), date(2026, 10, 31)),
                                  ("Apr", date(2026, 4, 1), date(2027, 3, 31)),
                                  ("April", None, date(2027, 3, 31))):
            with self.subTest(month=month, start=start), self.assertRaises(ValueError):
                resolve_legacy_month(month, start, end)
        for period in (date(2026, 4, 2), "2026-04", date(2025, 4, 1)):
            with self.subTest(period=period), self.assertRaises(ValueError):
                validate_period(period, date(2026, 4, 1), date(2027, 3, 31))

    def test_enrollment_month_overlap_is_inclusive_without_proration(self):
        validate_period(date(2026, 4, 1), date(2026, 4, 15), date(2027, 3, 31), date(2026, 4, 30))
        validate_period(date(2026, 5, 1), date(2026, 4, 1), date(2027, 3, 31), date(2026, 4, 1), date(2026, 5, 1))
        for admitted, withdrawn in ((date(2026, 6, 1), None), (date(2026, 4, 1), date(2026, 4, 30)),
                                    (date(2026, 6, 1), date(2026, 5, 1))):
            with self.subTest(admitted=admitted, withdrawn=withdrawn), self.assertRaises(ValueError):
                validate_period(date(2026, 5, 1), date(2026, 4, 1), date(2027, 3, 31), admitted, withdrawn)

    def test_discount_only_reduces_tuition_and_rounds_each_month_half_up(self):
        structure = SimpleNamespace(admission_fee="50.00", monthly_fee="1000.04", exam_fee="20.00")
        result = calculate_monthly_charge(structure, Decimal("12.50"), admission_due=True, include_exam_fee=True)
        self.assertEqual(result["discount_amount"], Decimal("125.01"))
        self.assertEqual(result["final_amount"], Decimal("945.03"))
        free_tuition = calculate_monthly_charge(structure, 100, admission_due=True, include_exam_fee=True)
        self.assertEqual(free_tuition["final_amount"], Decimal("70.00"))
        for amount in ("NaN", "Infinity", "1.001", "-1"):
            with self.subTest(amount=amount), self.assertRaises(HTTPException):
                calculate_monthly_charge(structure, amount, admission_due=False)


class FeeArchitectureTests(unittest.TestCase):
    # Reuse the established synthetic fixture, without re-running inherited tests.
    def setUp(self):
        legacy.FeeIntegrityTests.setUp(self)
        self.db.autoflush = False  # Match the real application session.

    def payment(self, amount="2500.00", **changes):
        lock_financial_organization(self.db, 1)
        values = dict(organization_id=1, student_id=1, session_id=1,
                      amount=Decimal(amount), receipt_no="ARCH-" + str(self.db.query(FeeTransaction).count()),
                      created_by=1, payment_date=date.today())
        values.update(changes)
        payment = FeeTransaction(**values)
        self.db.add(payment)
        self.db.flush()
        return payment

    def charge(self, period=date(2026, 5, 1), exam=False):
        return get_or_create_monthly_fee(self.db, org_id=1, student_id=1, session_id=1,
                                         period=period, include_exam_fee=exam)[0]

    def allocate(self, payment, fee, amount):
        return allocate_payment(self.db, org_id=1, transaction_id=payment.id, fee_id=fee.id, amount=Decimal(amount))

    def test_generation_flushes_once_only_admission_with_autoflush_disabled(self):
        structure = self.db.query(FeeStructure).one()
        structure.admission_fee, structure.exam_fee = Decimal(50), Decimal(20)
        self.db.flush()
        first, second = self.charge(exam=True), self.charge(date(2026, 6, 1))
        self.assertEqual((first.admission_fee, second.admission_fee), (Decimal(50), Decimal(0)))
        self.assertEqual((first.exam_fee, second.exam_fee), (Decimal(20), Decimal(0)))
        self.assertEqual(self.charge().id, first.id)
        self.assertEqual(self.db.query(StudentFee).count(), 3)

    def test_existing_obligation_keeps_snapshots_after_structure_and_discount_changes(self):
        fee = self.charge()
        old = (fee.final_amount, fee.discount_percent, fee.monthly_fee)
        self.db.query(FeeStructure).one().monthly_fee = Decimal(9000)
        self.db.query(StudentEnrollment).one().discount_percent = Decimal(0)
        self.db.flush()
        same = self.charge(exam=True)
        self.assertEqual((same.final_amount, same.discount_percent, same.monthly_fee), old)

    def test_generation_rejects_outside_enrollment_without_leaving_rows(self):
        self.db.query(StudentEnrollment).one().enrollment_date = date(2026, 6, 1)
        self.db.commit()
        with self.assertRaises(HTTPException):
            legacy.routes.generate_monthly_fees(1, "May", False, self.db, self.actor, self.session)
        self.assertEqual(self.db.query(StudentFee).count(), 1)

    def test_same_named_month_in_different_years_has_distinct_identity(self):
        self.session.end_date = date(2028, 3, 31)
        self.db.flush()
        one, two = self.charge(date(2027, 1, 1)), self.charge(date(2028, 1, 1))
        self.assertNotEqual(one.id, two.id)
        self.assertEqual(one.month, two.month)
        with self.assertRaises(HTTPException):
            legacy.routes.generate_monthly_fees(1, "January", False, self.db, self.actor, self.session)

    def test_database_rejects_duplicate_period_even_if_display_label_differs(self):
        self.db.add(StudentFee(organization_id=1, student_id=1, session_id=1, class_id=1,
                               month="different display", billing_period=date(2026, 4, 1),
                               monthly_fee=100, total_amount=100, final_amount=100))
        with self.assertRaises(IntegrityError):
            self.db.flush()
        self.db.rollback()

    def test_database_requires_normalized_period(self):
        self.db.get(StudentFee, 1).billing_period = date(2026, 4, 2)
        with self.assertRaises(IntegrityError):
            self.db.flush()
        self.db.rollback()

    def test_one_payment_multiple_allocations_and_later_credit_use(self):
        april, may = self.db.get(StudentFee, 1), self.charge()
        payment = self.payment()
        self.allocate(payment, april, "1000.00")
        self.allocate(payment, may, "500.00")
        self.db.commit()
        self.assertEqual(remaining_credit(self.db, payment), Decimal("1000.00"))
        self.assertEqual((april.status, may.status), ("paid", "partial"))
        self.allocate(payment, may, "375.03")
        self.db.commit()
        self.assertEqual(remaining_credit(self.db, payment), Decimal("624.97"))
        self.assertEqual(reconciled_fee_balance(self.db, may), 0)
        self.assertEqual(self.db.query(FeeTransaction).count(), 1)
        self.assertEqual(payment.amount, Decimal("2500.00"))
        self.assertEqual(self.db.scalar(select(func.sum(FeeAllocation.amount))) + remaining_credit(self.db, payment), payment.amount)

    def test_pure_advance_has_credit_without_a_fake_monthly_charge(self):
        count = self.db.query(StudentFee).count()
        payment = self.payment("123.45")
        self.db.commit()
        self.assertEqual(remaining_credit(self.db, payment), Decimal("123.45"))
        self.assertIsNone(payment.student_fee_id)
        self.assertEqual(self.db.query(StudentFee).count(), count)

    def test_allocation_caps_both_payment_credit_and_fee_outstanding(self):
        payment, fee = self.payment("50.00"), self.db.get(StudentFee, 1)
        with self.assertRaises(HTTPException) as failure:
            self.allocate(payment, fee, "50.01")
        self.assertEqual(failure.exception.status_code, 409)
        with self.assertRaises(HTTPException) as failure:
            self.allocate(payment, fee, "1000.01")
        self.assertEqual(failure.exception.status_code, 400)
        self.assertEqual(self.db.query(FeeAllocation).count(), 0)

    def test_cross_tenant_and_cross_student_allocation_is_denied(self):
        payment = self.payment()
        with self.assertRaises(HTTPException) as failure:
            allocate_payment(self.db, org_id=2, transaction_id=payment.id, fee_id=1, amount=Decimal(1))
        self.assertEqual(failure.exception.status_code, 404)
        self.db.add(Student(id=3, organization_id=1, admission_no="SAME-SCHOOL", first_name="Other"))
        self.db.flush()
        other = StudentFee(student_id=3, organization_id=1, class_id=1, session_id=1, month="April",
                           billing_period=date(2026, 4, 1), monthly_fee=100, total_amount=100, final_amount=100)
        self.db.add(other)
        self.db.flush()
        with self.assertRaises(HTTPException):
            self.allocate(payment, other, "1.00")
        self.db.add(FeeAllocation(organization_id=1, student_id=1, session_id=1,
                                  transaction_id=payment.id, student_fee_id=other.id, amount=1))
        with self.assertRaises(IntegrityError):
            self.db.flush()
        self.db.rollback()

    def test_database_rejects_cross_organization_payment_ownership(self):
        with self.assertRaises(IntegrityError):
            self.payment(organization_id=2)
        self.db.rollback()

    def test_failure_after_first_allocation_rolls_back_whole_unit_of_work(self):
        payment = self.payment()
        may = self.charge()
        self.allocate(payment, self.db.get(StudentFee, 1), "100.00")
        with self.assertRaises(HTTPException):
            self.allocate(payment, may, "99999.00")
        self.db.rollback()
        self.assertEqual(self.db.query(FeeTransaction).count(), 0)
        self.assertEqual(self.db.query(FeeAllocation).count(), 0)
        self.assertEqual(self.db.query(StudentFee).count(), 1)
        self.assertEqual(self.db.get(StudentFee, 1).paid_amount, 0)

    def test_existing_collection_rolls_back_when_allocation_insert_fails(self):
        def fail_allocation(conn, cursor, statement, params, context, many):
            if statement.lstrip().upper().startswith("INSERT INTO FEE_ALLOCATIONS"):
                raise SQLAlchemyError("Synthetic allocation failure")
        event.listen(self.engine, "before_cursor_execute", fail_allocation)
        try:
            with self.assertRaises(HTTPException) as failure:
                collect_fee_payment(self.db, self.actor, 1, Decimal(10), "allocation-failure")
            self.assertEqual(failure.exception.status_code, 503)
        finally:
            event.remove(self.engine, "before_cursor_execute", fail_allocation)
        self.assertEqual(self.db.query(FeeTransaction).count(), 0)
        self.assertEqual(self.db.get(StudentFee, 1).paid_amount, 0)

    def test_legacy_replay_without_new_snapshot_fields_and_receipt_still_work(self):
        response = collect_fee_payment(self.db, self.actor, 1, Decimal("10.25"), "old-payment-key")
        payment = self.db.get(FeeTransaction, response["transaction_id"])
        self.assertEqual(len(payment.request_fingerprint), 64)
        self.assertEqual(payment.response_snapshot, response)
        payment.request_fingerprint = payment.response_snapshot = None
        self.db.commit()
        self.assertEqual(collect_fee_payment(self.db, self.actor, 1, Decimal("10.25"), "old-payment-key"), response)
        payment.idempotency_key = payment.paid_amount_after = payment.fee_status_after = None
        self.db.commit()
        result = legacy.routes.download_payment_receipt(payment.id, self.db, self.actor)
        self.assertTrue(result.body.startswith(b"%PDF"))

    def test_mismatched_paid_projection_blocks_new_collection(self):
        payment = self.payment()
        self.allocate(payment, self.db.get(StudentFee, 1), "100.00")
        self.db.get(StudentFee, 1).paid_amount = Decimal("99.00")
        self.db.commit()
        with self.assertRaises(HTTPException):
            collect_fee_payment(self.db, self.actor, 1, Decimal(1), "bad-projection")

    def test_dashboard_counts_cash_once_including_unallocated_credit(self):
        from app.routers import dashboard
        self.db.add(OrganizationMember(user_id=1, organization_id=1, role="accountant"))
        self.db.flush()
        payment, may = self.payment(), self.charge()
        self.allocate(payment, self.db.get(StudentFee, 1), "1000.00")
        self.allocate(payment, may, "500.00")
        self.db.commit()
        with patch.object(dashboard.redis_client, "get", return_value=None), patch.object(dashboard.redis_client, "set"):
            result = dashboard.get_dashboard_stats(self.db, self.actor, self.session)
        self.assertEqual(result["financials"]["revenue"]["yearTotal"], 2500)

    def test_advance_only_student_history_cannot_be_deleted(self):
        from app.crud.student import delete_student
        self.db.add(Student(id=3, organization_id=1, admission_no="ADVANCE-ONLY", first_name="New"))
        self.db.flush()
        self.payment(student_id=3)
        self.db.commit()
        with self.assertRaises(HTTPException) as failure:
            delete_student(self.db, 3, 1)
        self.assertEqual(failure.exception.status_code, 409)
