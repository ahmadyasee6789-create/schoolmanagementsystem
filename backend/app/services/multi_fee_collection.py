"""Preview and atomic multi-month collection on Phase 1 obligations/allocations."""
from datetime import date
from decimal import Decimal
import hashlib
import json

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.financial_permissions import require_financial_permission, require_discount_access
from app.models.academic_session import AcademicSession
from app.models.classroom import Classroom, Grade
from app.models.fee_allocation import FeeAllocation
from app.models.fee_collection_command import FeeCollectionCommand
from app.models.fee_yearly_discount import FeeYearlyDiscount
from app.models.fee_transection import FeeTransaction
from app.models.student_enrollment import StudentEnrollment
from app.models.student_fee import StudentFee
from app.models.students import Student
from app.schemas.fee_collection import (CollectionPreviewRequest, CollectionPreviewResponse,
                                        CollectionResponse, FeeLine, ReceiptInfo)
from app.services.billing_periods import validate_period
from app.services.fee_allocations import allocate_payment, remaining_credit, reconciled_fee_balance, yearly_discount_total
from app.services.fee_amounts import money, CENT
from decimal import ROUND_HALF_UP
from app.services.fee_collection import generate_receipt_number, validate_idempotency_key
from app.services.fee_locks import lock_financial_organization
from app.services.monthly_fees import quote_missing_month, get_or_create_monthly_fee

ZERO = Decimal("0.00")
AMOUNTS = ("admission_fee", "monthly_fee", "exam_fee", "total_amount", "discount_percent",
           "discount_amount", "final_amount", "paid_amount")


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode()).hexdigest()


def class_names(db, org_id, class_ids):
    rows = db.query(Grade.name, Classroom.section).join(Classroom, Classroom.grade_id == Grade.id).filter(
        Classroom.id.in_(class_ids), Classroom.organization_id == org_id, Grade.organization_id == org_id,
    ).order_by(Classroom.id).all()
    return [f"{grade} - {section}" if section else grade for grade, section in rows]


def fee_line(fee, *, generated=False, yearly_discount_amount=ZERO, yearly_discount_percent=ZERO):
    values = fee if isinstance(fee, dict) else {c.name: getattr(fee, c.name) for c in StudentFee.__table__.columns}
    final, paid = money(values["final_amount"]), money(values["paid_amount"])
    yearly_discount_amount, yearly_discount_percent = money(yearly_discount_amount), money(yearly_discount_percent)
    period = values["billing_period"]
    return FeeLine(
        fee_id=values.get("id"), session_id=values["session_id"], class_id=values["class_id"],
        billing_period=period.strftime("%Y-%m"), generated=generated,
        **{name: money(values[name]) for name in AMOUNTS}, yearly_discount_amount=yearly_discount_amount,
        yearly_discount_percent=yearly_discount_percent, outstanding=final-paid-yearly_discount_amount,
        status="paid" if paid + yearly_discount_amount == final else "partial" if paid else "unpaid",
        future=period > date.today().replace(day=1),
        overdue=period < date.today().replace(day=1) and paid + yearly_discount_amount < final,
    ).model_dump(mode="json")


def _read(query, lock=False):
    query = query.populate_existing()
    return query.with_for_update() if lock else query


def _build_preview(db, org_id, request, *, lock=False):
    """No writes, including no autoflush. Locking is only used at confirmation."""
    student = _read(db.query(Student).filter_by(id=request.student_id, organization_id=org_id), lock).first()
    session = _read(db.query(AcademicSession).filter_by(id=request.session_id, organization_id=org_id), lock).first()
    if student is None or session is None:
        raise HTTPException(404, "Student or academic session not found")
    enrollment = _read(db.query(StudentEnrollment).filter_by(student_id=student.id, session_id=session.id), lock).first()
    if enrollment is None or enrollment.enrollment_date is None:
        raise HTTPException(409, "Student enrollment with dates is required")
    if not session.start_date or not session.end_date or session.start_date >= session.end_date:
        raise HTTPException(409, "Academic session dates are invalid")
    if (enrollment.enrollment_date > session.end_date or
            (enrollment.withdrawal_date and enrollment.withdrawal_date < max(session.start_date, enrollment.enrollment_date))):
        raise HTTPException(409, "Enrollment dates do not overlap this session")
    if request.period_type == "advance_only" and (not enrollment.is_active or not student.is_active):
        raise HTTPException(409, "Advance-only collection requires an active student enrollment")
    periods = [date.fromisoformat(m + "-01") for m in request.billing_periods]
    try:
        for period in periods:
            validate_period(period, session.start_date, session.end_date,
                            enrollment.enrollment_date, enrollment.withdrawal_date)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

    fees = _read(db.query(StudentFee).filter_by(organization_id=org_id, student_id=student.id)
                 .order_by(StudentFee.session_id, StudentFee.billing_period, StudentFee.id), lock).all()
    balances = {fee.id: reconciled_fee_balance(db, fee) for fee in fees}
    existing = {f.billing_period: f for f in fees if f.session_id == session.id}
    obligations = []
    admission_planned = False
    for period, month in zip(periods, request.billing_periods):
        fee = existing.get(period)
        if fee is not None:
            if (month in request.exam_periods and fee.exam_fee == 0) or (month == request.admission_period and fee.admission_fee == 0):
                raise HTTPException(409, "An issued fee snapshot cannot be changed to add optional heads")
            obligations.append(fee_line(fee, yearly_discount_amount=yearly_discount_total(db, fee)))
        else:
            if month == request.admission_period and any(f.admission_fee > 0 for f in existing.values()):
                raise HTTPException(409, "Admission has already been charged in this session")
            values = quote_missing_month(
                db, org_id=org_id, student_id=student.id, session_id=session.id, period=period,
                include_admission_fee=month == request.admission_period,
                include_exam_fee=month in request.exam_periods, admission_planned=admission_planned, lock=lock,
            )
            admission_planned |= values["admission_fee"] > 0
            obligations.append(fee_line(values, generated=True))

    # A yearly concession applies only to tuition remaining after the enrollment
    # concession; admission/exam heads and already-paid value are never repriced.
    if request.yearly_discount_percent:
        for line in obligations:
            eligible = max(ZERO, Decimal(line["monthly_fee"]) - Decimal(line["discount_amount"]))
            concession = (eligible * request.yearly_discount_percent / 100).quantize(CENT, rounding=ROUND_HALF_UP)
            concession = min(concession, Decimal(line["outstanding"]))
            line["yearly_discount_percent"] = money(request.yearly_discount_percent)
            line["yearly_discount_amount"] = money(concession)
            line["outstanding"] = money(Decimal(line["outstanding"]) - concession)
            line["status"] = "paid" if Decimal(line["outstanding"]) == 0 else line["status"]

    payments = _read(db.query(FeeTransaction).filter_by(organization_id=org_id, student_id=student.id, session_id=session.id)
                     .order_by(FeeTransaction.payment_date, FeeTransaction.id), lock).all()
    credits = [{"transaction_id": p.id, "receipt_no": p.receipt_no, "available": remaining_credit(db, p)} for p in payments]
    credits = [c for c in credits if c["available"] > 0]
    available = sum((c["available"] for c in credits), ZERO)
    total = sum((Decimal(f["outstanding"]) for f in obligations), ZERO)
    if request.credit_amount > min(available, total):
        raise HTTPException(409, "Requested credit exceeds available credit or the selected outstanding balance")
    excess = max(ZERO, request.amount + request.credit_amount - total)
    if excess and not request.retain_excess_as_credit:
        raise HTTPException(422, "Excess cash requires explicit retain_excess_as_credit confirmation")
    tendered = request.amount + request.credit_amount
    if request.yearly_discount_percent and (lock or tendered) and tendered != total:
        raise HTTPException(422, "Yearly discount requires full settlement of all 12 eligible months after discount")
    # Credit is consumed oldest-receipt first, then new cash. Both apply only to
    # selected obligations in chronological order; earlier dues are display-only.
    sources, credit_left = [], request.credit_amount
    for credit in credits:
        amount = min(credit["available"], credit_left)
        if amount:
            sources.append(["credit", credit["transaction_id"], amount])
            credit_left -= amount
    sources.append(["cash", None, request.amount - excess])
    allocations = []
    for obligation in obligations:
        outstanding = Decimal(obligation["outstanding"])
        for source in sources:
            amount = min(outstanding, source[2])
            if amount:
                allocations.append(dict(fee_id=obligation["fee_id"], billing_period=obligation["billing_period"],
                                        transaction_id=source[1], source=source[0], amount=amount))
                source[2] -= amount
                outstanding -= amount
    previous = [fee_line(f) for f in fees if f.billing_period < (periods[0] if periods else date.today().replace(day=1))
                and balances[f.id] > ZERO]
    result = dict(student_id=student.id, student_name=f"{student.first_name} {student.last_name or ''}".strip(),
                  session_id=session.id, session_name=session.name, billing_periods=request.billing_periods,
                  obligations=obligations, previous_dues=previous, available_credit=available, credit_sources=credits,
                  total_payable=total, cash_received=request.amount, credit_used=request.credit_amount,
                  allocations=allocations, remaining_due=max(ZERO, total-request.amount-request.credit_amount),
                  new_advance_credit=excess, remaining_advance_credit=available-request.credit_amount+excess)
    # Include policy inputs even when a changed price rounds to the same cents.
    context = dict(org_id=org_id, request=request.model_dump(mode="json", exclude={"preview_id"}),
                   session=[session.start_date, session.end_date],
                   enrollment=[enrollment.id, enrollment.classroom_id, enrollment.enrollment_date,
                               enrollment.withdrawal_date, enrollment.is_active, enrollment.discount_percent],
                   student_active=student.is_active, today=date.today(), result=result)
    result["preview_id"] = digest(context)
    return CollectionPreviewResponse(**result).model_dump(mode="json")


def preview_collection(db, current_user, request):
    require_financial_permission(current_user, "collect_fees")
    if request.yearly_discount_percent:
        require_discount_access(current_user, request.yearly_discount_percent)
    with db.no_autoflush:
        return _build_preview(db, current_user.org_id, request)


def collect_multi(db, current_user, request, idempotency_key):
    require_financial_permission(current_user, "collect_fees")
    if request.yearly_discount_percent:
        require_discount_access(current_user, request.yearly_discount_percent)
    validate_idempotency_key(idempotency_key)
    if request.amount + request.credit_amount <= 0:
        raise HTTPException(422, "Collection requires cash or explicit existing credit usage")
    org_id = current_user.org_id
    payload = request.model_dump(mode="json")
    fingerprint = digest({"v": 2, "operation": "multi", "request": payload})
    compatible_fingerprints = {fingerprint}
    if not request.yearly_discount_percent:
        # An ordinary collection confirmed before Phase 3.1 must still replay.
        payload.pop("yearly_discount_percent")
        compatible_fingerprints.add(digest({"v": 2, "operation": "multi", "request": payload}))
    try:
        lock_financial_organization(db, org_id)
        previous = db.query(FeeCollectionCommand).filter_by(organization_id=org_id, idempotency_key=idempotency_key).first()
        if previous is not None:
            if previous.request_fingerprint not in compatible_fingerprints:
                raise HTTPException(409, "This Idempotency-Key was already used for a different collection")
            result = dict(previous.response_snapshot)
            db.commit()
            return result
        if db.query(FeeTransaction.id).filter_by(organization_id=org_id, idempotency_key=idempotency_key).first():
            raise HTTPException(409, "This Idempotency-Key was already used for another payment")
        try:
            with db.no_autoflush:
                preview = _build_preview(db, org_id, request, lock=True)
        except HTTPException as exc:
            # A previously valid preview can become an overpayment, lose its
            # credit/rate, or fall outside edited enrollment dates. Confirmation
            # must consistently request a fresh preview in these cases.
            if exc.status_code in (409, 422) or exc.detail == "Fee structure not found for this class and session":
                raise HTTPException(409, "Preview is no longer valid; request a fresh preview before confirming") from exc
            raise
        if preview["preview_id"] != request.preview_id:
            raise HTTPException(409, "Preview is stale; request a fresh preview before confirming")

        fees = {}
        for line in preview["obligations"]:
            period = date.fromisoformat(line["billing_period"] + "-01")
            fee, _ = get_or_create_monthly_fee(
                db, org_id=org_id, student_id=request.student_id, session_id=request.session_id, period=period,
                include_admission_fee=line["billing_period"] == request.admission_period,
                include_exam_fee=line["billing_period"] in request.exam_periods,
            )
            fees[line["billing_period"]] = fee
        payment = None
        if request.amount:
            payment = FeeTransaction(
                organization_id=org_id, student_id=request.student_id, session_id=request.session_id,
                amount=request.amount, payment_date=date.today(), receipt_no=generate_receipt_number(db, org_id),
                created_by=current_user.id, idempotency_key=idempotency_key,
                request_fingerprint=fingerprint, response_snapshot={},
            )
            db.add(payment)
            db.flush()
        command = FeeCollectionCommand(
            organization_id=org_id, student_id=request.student_id, session_id=request.session_id,
            transaction_id=payment.id if payment else None, created_by=current_user.id,
            idempotency_key=idempotency_key, request_fingerprint=fingerprint, response_snapshot={},
        )
        db.add(command)
        db.flush()
        if request.yearly_discount_percent:
            for line in preview["obligations"]:
                discount = Decimal(line["yearly_discount_amount"])
                if discount:
                    fee = fees[line["billing_period"]]
                    db.add(FeeYearlyDiscount(organization_id=org_id, student_id=fee.student_id, session_id=fee.session_id,
                                             student_fee_id=fee.id, collection_command_id=command.id,
                                             discount_percent=request.yearly_discount_percent, amount=discount,
                                             approved_by=current_user.id))
                    if discount == fee.final_amount - fee.paid_amount:
                        fee.status = "paid"
            db.flush()
        applied = []
        for planned in preview["allocations"]:
            fee = fees[planned["billing_period"]]
            transaction_id = planned["transaction_id"] if planned["source"] == "credit" else payment.id
            allocation = allocate_payment(db, org_id=org_id, transaction_id=transaction_id,
                                          fee_id=fee.id, amount=Decimal(planned["amount"]))
            applied.append({**planned, "fee_id": fee.id, "transaction_id": transaction_id, "allocation_id": allocation.id})
        obligations = [fee_line(fees[line["billing_period"]], generated=line["generated"],
                                yearly_discount_amount=yearly_discount_total(db, fees[line["billing_period"]]),
                                yearly_discount_percent=request.yearly_discount_percent if Decimal(line["yearly_discount_amount"]) else ZERO)
                       for line in preview["obligations"]]
        result = CollectionResponse(
            command_id=command.id, student_id=request.student_id, session_id=request.session_id,
            transaction_id=payment.id if payment else None, receipt_no=payment.receipt_no if payment else None,
            receipt_url=f"/fees/payments/{payment.id}/receipt" if payment else None,
            cash_received=request.amount, credit_used=request.credit_amount,
            new_advance_credit=preview["new_advance_credit"], remaining_advance_credit=preview["remaining_advance_credit"],
            allocations=applied, obligations=obligations,
        ).model_dump(mode="json")
        command.response_snapshot = result
        if payment:
            student = db.get(Student, request.student_id)
            receipt = ReceiptInfo(
                transaction_id=payment.id, receipt_no=payment.receipt_no,
                school_name=student.organization.name, student_name=preview["student_name"],
                student_id=request.student_id, session_id=request.session_id, session_name=preview["session_name"],
                class_names=class_names(db, org_id, {f["class_id"] for f in obligations}),
                payment_date=payment.payment_date, payment_method=request.payment_method,
                cash_received=request.amount, allocations=[a for a in applied if a["source"] == "cash"],
                obligations=obligations, remaining_advance_credit=remaining_credit(db, payment), balance_basis="at_issue",
            ).model_dump(mode="json")
            payment.response_snapshot = {"collection_version": 2, "receipt": receipt}
        db.flush()
        db.commit()
        return result
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Collection conflicted; retry with the same Idempotency-Key") from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(503, "Collection could not be confirmed; retry with the same Idempotency-Key") from exc
    except Exception:
        db.rollback()
        raise
