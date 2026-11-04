"""Explicit months and exact money. New APIs serialize currency as decimal strings."""
from datetime import date
from decimal import Decimal
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from app.schemas.student_fee import Money

Month = Annotated[str, Field(pattern=r"^[0-9]{4}-(0[1-9]|1[0-2])$")]


class CollectionPreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_id: int = Field(gt=0, strict=True)
    session_id: int = Field(gt=0, strict=True)
    period_type: Literal["monthly", "quarterly", "half_yearly", "yearly", "custom", "advance_only"] = "custom"
    billing_periods: list[Month] = Field(default_factory=list, max_length=120)
    admission_period: Month | None = None
    exam_periods: list[Month] = Field(default_factory=list, max_length=120)
    amount: Money = Decimal("0.00")
    credit_amount: Money = Decimal("0.00")
    retain_excess_as_credit: bool = Field(default=False, strict=True)
    payment_method: Literal["cash", "bank_transfer", "cheque", "other"] | None = None
    yearly_discount_percent: Money = Decimal("0.00")

    @field_validator("amount", "credit_amount", "yearly_discount_percent", mode="before")
    @classmethod
    def reject_boolean_money(cls, value):
        if isinstance(value, bool):
            raise ValueError("Money must not be a boolean")
        return value

    @field_validator("amount", "credit_amount", "yearly_discount_percent")
    @classmethod
    def normalize_money(cls, value):
        return value.quantize(Decimal("0.01"))

    @model_validator(mode="after")
    def validate_selection(self):
        for periods in (self.billing_periods, self.exam_periods):
            if periods != sorted(set(periods)):
                raise ValueError("Months must be unique and in chronological order")
            for period in periods:
                date.fromisoformat(period + "-01")
        selected = set(self.billing_periods)
        if not set(self.exam_periods) <= selected or (self.admission_period and self.admission_period not in selected):
            raise ValueError("Optional fee heads must reference a selected month")
        if self.period_type == "advance_only":
            if selected or self.credit_amount or not self.retain_excess_as_credit or self.amount <= 0:
                raise ValueError("Advance-only requires positive cash, no months or credit usage, and explicit credit retention")
        elif not selected:
            raise ValueError("Select at least one billing month, or use advance_only")
        count = {"monthly": 1, "quarterly": 3, "half_yearly": 6, "yearly": 12}.get(self.period_type)
        if count:
            ordinal = [int(m[:4]) * 12 + int(m[5:]) for m in self.billing_periods]
            if len(ordinal) != count or ordinal != list(range(ordinal[0], ordinal[0] + count)):
                raise ValueError("Preset requires the exact number of consecutive explicit months")
        if self.amount == 0 and self.payment_method is not None:
            raise ValueError("Payment method applies only to newly received cash")
        if self.yearly_discount_percent and self.period_type != "yearly":
            raise ValueError("Yearly discount is only available for a 12-month yearly collection")
        if self.yearly_discount_percent > 100:
            raise ValueError("Yearly discount must not exceed 100 percent")
        return self


class CollectionRequest(CollectionPreviewRequest):
    preview_id: str = Field(pattern=r"^[a-f0-9]{64}$")


class FeeLine(BaseModel):
    fee_id: int | None
    session_id: int
    class_id: int
    billing_period: Month
    generated: bool = False
    admission_fee: Money
    monthly_fee: Money
    exam_fee: Money
    total_amount: Money
    discount_percent: Money
    discount_amount: Money
    yearly_discount_amount: Money = Decimal("0.00")
    yearly_discount_percent: Money = Decimal("0.00")
    final_amount: Money
    paid_amount: Money
    outstanding: Money
    status: Literal["paid", "partial", "unpaid"]
    future: bool
    overdue: bool


class AllocationLine(BaseModel):
    fee_id: int | None
    billing_period: Month
    transaction_id: int | None
    source: Literal["credit", "cash"]
    amount: Money
    allocation_id: int | None = None


class CreditLine(BaseModel):
    transaction_id: int
    receipt_no: str
    available: Money


class CollectionPreviewResponse(BaseModel):
    student_id: int
    student_name: str
    session_id: int
    session_name: str
    billing_periods: list[Month]
    obligations: list[FeeLine]
    previous_dues: list[FeeLine]
    available_credit: Money
    credit_sources: list[CreditLine]
    total_payable: Money
    cash_received: Money
    credit_used: Money
    allocations: list[AllocationLine]
    remaining_due: Money
    new_advance_credit: Money
    remaining_advance_credit: Money
    preview_id: str


class CollectionResponse(BaseModel):
    command_id: int
    student_id: int
    session_id: int
    transaction_id: int | None
    receipt_no: str | None
    receipt_url: str | None
    cash_received: Money
    credit_used: Money
    new_advance_credit: Money
    remaining_advance_credit: Money
    allocations: list[AllocationLine]
    obligations: list[FeeLine]


class ReceiptInfo(BaseModel):
    transaction_id: int
    receipt_no: str
    school_name: str
    student_name: str
    student_id: int
    session_id: int
    session_name: str
    class_names: list[str] = Field(default_factory=list)
    payment_date: date
    payment_method: str | None
    cash_received: Money
    allocations: list[AllocationLine]
    obligations: list[FeeLine]
    remaining_advance_credit: Money
    balance_basis: Literal["at_issue", "current_legacy"]
