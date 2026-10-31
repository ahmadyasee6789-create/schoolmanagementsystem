from datetime import date
from decimal import Decimal
from typing import Annotated, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

Money = Annotated[Decimal, Field(ge=0, le=Decimal("999999999999.99"), max_digits=14, decimal_places=2, allow_inf_nan=False)]


class StudentFeeCreate(BaseModel):
    student_id: int
    class_id: int
    amount: Money
    month: str
    receipt_no: Optional[str] = None


class StudentFeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    student_id: int
    class_id: int
    month: str
    total_amount: Money
    paid_amount: Money
    final_amount: Money
    status: str


class PaymentResponse(StudentFeeOut):
    amount: Money
    payment_date: date
    receipt_no: str


class PaymentCreate(BaseModel):
    amount: Annotated[Decimal, Field(gt=0, le=Decimal("999999999999.99"), max_digits=14, decimal_places=2, allow_inf_nan=False)]

    @field_validator('amount', mode='before')
    @classmethod
    def reject_boolean_amount(cls, value):
        if isinstance(value, bool):
            raise ValueError('Payment amount must be a monetary value')
        return value
