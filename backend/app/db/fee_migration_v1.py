"""Frozen, read-only preparation for h42a81f3b075. Do not change after release.

No application engine or dotenv is imported. CLI use requires an explicitly set
FEE_MIGRATION_REVIEW_URL and opens a PostgreSQL READ ONLY transaction. The output
contains record IDs/reasons only, never credentials or student identity fields.
"""
from calendar import monthrange
from collections import defaultdict
from datetime import date
from decimal import Decimal, InvalidOperation
import json

import sqlalchemy as sa

MONTHS = ("January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December")
MONEY_COLUMNS = ("admission_fee", "monthly_fee", "exam_fee", "total_amount",
                 "discount_amount", "final_amount", "paid_amount")


class FeeBackfillError(RuntimeError):
    def __init__(self, issues):
        self.issues = issues
        super().__init__("Fee migration preflight refused: " + json.dumps(issues, sort_keys=True))


def _money(value, *, positive=False, upper=Decimal("999999999999.99")):
    try:
        if value is None or isinstance(value, bool):
            raise ValueError
        value = Decimal(str(value))
        if (not value.is_finite() or value < 0 or value > upper
                or value != value.quantize(Decimal(".01")) or (positive and value == 0)):
            raise ValueError
        return value
    except (ValueError, TypeError, InvalidOperation):
        raise ValueError("invalid monetary value or precision") from None


def _period(fee, session, enrollment):
    # Frozen version of calendar-overlap policy; do not import evolving services.
    start, end = session["start_date"], session["end_date"]
    if type(start) is not date or type(end) is not date or start >= end:
        raise ValueError("invalid academic session dates")
    if fee["month"] not in MONTHS:
        raise ValueError("unsupported legacy month name")
    month = MONTHS.index(fee["month"]) + 1
    candidates = [date(year, month, 1) for year in range(start.year, end.year + 1)
                  if date(year, month, 1) <= end and date(year, month, monthrange(year, month)[1]) >= start]
    if len(candidates) != 1:
        raise ValueError("legacy month has no unique year in academic session")
    period = candidates[0]
    if enrollment is None or type(enrollment["enrollment_date"]) is not date:
        raise ValueError("missing dated enrollment for student/session")
    admitted, withdrawn = enrollment["enrollment_date"], enrollment["withdrawal_date"]
    if withdrawn is not None and (type(withdrawn) is not date or withdrawn < admitted):
        raise ValueError("invalid enrollment dates")
    month_end = date(period.year, period.month, monthrange(period.year, period.month)[1])
    if max(start, period, admitted) > min(end, month_end, withdrawn or end):
        raise ValueError("billing month does not overlap enrollment and session")
    return period


def prepare_legacy_fee_backfill(connection):
    """SELECT/reflection only. Return a verified plan, or all affected record IDs.

    This is deliberately valid against the predecessor schema. No models, DDL,
    session commits, billing updates, or fabricated payment records are used.
    """
    metadata = sa.MetaData()

    def rows(name, columns):
        table = sa.Table(name, metadata, autoload_with=connection)
        return list(connection.execute(sa.select(*(table.c[c] for c in columns))).mappings())

    fees = rows("student_fees", ("id", "organization_id", "student_id", "class_id", "session_id", "month",
                                "discount_percent", "status", *MONEY_COLUMNS))
    payments = rows("fee_transactions", ("id", "organization_id", "student_fee_id", "amount", "receipt_no",
                                          "idempotency_key", "paid_amount_after", "fee_status_after"))
    sessions = {r["id"]: r for r in rows("academic_sessions", ("id", "organization_id", "start_date", "end_date"))}
    students = {r["id"]: r for r in rows("students", ("id", "organization_id"))}
    classes = {r["id"]: r for r in rows("classrooms", ("id", "organization_id", "academic_year_id", "grade_id"))}
    grades = {r["id"]: r for r in rows("grades", ("id", "organization_id"))}
    enrollments = defaultdict(list)
    for row in rows("student_enrollments", ("id", "student_id", "session_id", "enrollment_date", "withdrawal_date")):
        enrollments[(row["student_id"], row["session_id"])].append(row)
    issues, periods, allocations = [], [], []
    fees_by_id = {r["id"]: r for r in fees}
    paid_by_fee = defaultdict(lambda: Decimal("0.00"))
    seen_periods, receipts, keys = {}, {}, {}

    def issue(table, record_id, reason):
        issues.append({"table": table, "id": record_id, "reason": reason})

    for fee in fees:
        fid, org = fee["id"], fee["organization_id"]
        session, student, classroom = sessions.get(fee["session_id"]), students.get(fee["student_id"]), classes.get(fee["class_id"])
        grade = grades.get(classroom["grade_id"]) if classroom else None
        owner_valid = (all(r is not None and r["organization_id"] == org for r in (session, student, classroom, grade))
                       and classroom["academic_year_id"] == fee["session_id"])
        if not owner_valid:
            issue("student_fees", fid, "missing or mismatched student/class/session/grade ownership")
        else:
            try:
                enrollment = enrollments[(fee["student_id"], fee["session_id"])]
                if len(enrollment) != 1:
                    raise ValueError("missing or duplicate student/session enrollment")
                period = _period(fee, session, enrollment[0])
                key = (org, fee["student_id"], fee["session_id"], period)
                if key in seen_periods:
                    issue("student_fees", seen_periods[key], "duplicate monthly obligation")
                    raise ValueError("duplicate monthly obligation")
                seen_periods[key] = fid
                periods.append({"id": fid, "period": period})
            except ValueError as exc:
                issue("student_fees", fid, str(exc))
        try:
            amounts = {name: _money(fee[name]) for name in MONEY_COLUMNS}
            _money(fee["discount_percent"], upper=Decimal(100))
            gross = sum(amounts[name] for name in ("admission_fee", "monthly_fee", "exam_fee"))
            if (gross != amounts["total_amount"] or amounts["discount_amount"] > gross
                    or gross - amounts["discount_amount"] != amounts["final_amount"]
                    or amounts["paid_amount"] > amounts["final_amount"]):
                raise ValueError("inconsistent fee breakdown or paid balance")
            expected = "paid" if amounts["paid_amount"] == amounts["final_amount"] else "partial" if amounts["paid_amount"] else "unpaid"
            if fee["status"] != expected:
                raise ValueError("status does not match recorded balance")
        except ValueError as exc:
            issue("student_fees", fid, str(exc))

    for payment in payments:
        pid, org = payment["id"], payment["organization_id"]
        fee = fees_by_id.get(payment["student_fee_id"])
        if fee is None or fee["organization_id"] != org:
            issue("fee_transactions", pid, "missing or cross-organization fee relationship")
            continue
        try:
            amount = _money(payment["amount"], positive=True)
            if payment["receipt_no"] is None:
                raise ValueError("missing receipt number")
            receipt_key = (org, payment["receipt_no"])
            if receipt_key in receipts:
                issue("fee_transactions", receipts[receipt_key], "duplicate organization receipt")
                raise ValueError("duplicate organization receipt")
            receipts[receipt_key] = pid
            if payment["idempotency_key"] is not None:
                key = (org, payment["idempotency_key"])
                if key in keys:
                    issue("fee_transactions", keys[key], "duplicate organization idempotency key")
                    raise ValueError("duplicate organization idempotency key")
                keys[key] = pid
                if (_money(payment["paid_amount_after"]) < amount
                        or payment["fee_status_after"] not in ("partial", "paid")):
                    raise ValueError("invalid original payment response snapshot")
            paid_by_fee[fee["id"]] += amount
            allocations.append(dict(transaction_id=pid, student_fee_id=fee["id"], organization_id=org,
                                    student_id=fee["student_id"], session_id=fee["session_id"], amount=amount))
        except ValueError as exc:
            issue("fee_transactions", pid, str(exc))
    for fee in fees:
        try:
            if _money(fee["paid_amount"]) != paid_by_fee[fee["id"]]:
                issue("student_fees", fee["id"], "paid amount does not reconcile to recorded transactions")
        except ValueError:
            pass  # Already reported above.
    if issues:
        raise FeeBackfillError(issues)
    return {"periods": periods, "allocations": allocations}


def main():
    import os
    from sqlalchemy.exc import SQLAlchemyError
    raw = os.environ.get("FEE_MIGRATION_REVIEW_URL")
    if not raw:
        raise SystemExit("Set FEE_MIGRATION_REVIEW_URL explicitly; application .env is not read")
    engine = None
    try:
        engine = sa.create_engine(raw, isolation_level="REPEATABLE READ")
        if engine.dialect.name != "postgresql":
            raise SystemExit("The review CLI requires PostgreSQL READ ONLY transactions")
        with engine.begin() as connection:
            connection.execute(sa.text("SET TRANSACTION READ ONLY"))
            plan = prepare_legacy_fee_backfill(connection)
            print(json.dumps({"valid": True, "fees": len(plan["periods"]), "payments": len(plan["allocations"])}))
    except FeeBackfillError as exc:
        print(json.dumps({"valid": False, "issues": exc.issues}, indent=2))
        raise SystemExit(1) from None
    except SQLAlchemyError:
        raise SystemExit("Read-only review could not complete; check connection/schema privately. No migration was executed.") from None
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == "__main__":
    main()
