from decimal import Decimal
from pydantic import BaseModel, BeforeValidator, Field, field_validator
from datetime import date, datetime
from typing import Annotated, Optional


def _reject_boolean_amount(value):
    if isinstance(value, bool):
        raise ValueError("A monetary amount must be a number")
    return value


SalaryAmount = Annotated[
    Decimal,
    BeforeValidator(_reject_boolean_amount),
    Field(ge=0, le=Decimal("99999999.99"), max_digits=10, decimal_places=2, allow_inf_nan=False),
]


class StaffSalaryCreate(BaseModel):
    employee_id: int
    base_salary: SalaryAmount
    pay_frequency: str = "monthly"
    effective_from: date
    effective_to: Optional[date] = None


class StaffSalaryUpdate(BaseModel):
    base_salary: Optional[SalaryAmount] = None
    pay_frequency: Optional[str] = None
    effective_to: Optional[date] = None

    @field_validator("base_salary")
    @classmethod
    def reject_explicit_null_salary(cls, value):
        if value is None:
            raise ValueError("Base salary cannot be null")
        return value


class StaffSalaryResponse(BaseModel):
    id: int
    organization_id: int
    employee_id: int
    base_salary: float
    pay_frequency: str
    effective_from: date
    effective_to: Optional[date]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class SalaryGenerate(BaseModel):
    employee_id: int
    month: int = Field(..., ge=1, le=12)
    year: int


class SalaryPay(BaseModel):
    payment_method: str
    deductions: Optional[SalaryAmount] = Decimal("0")
    bonus: Optional[SalaryAmount] = Decimal("0")


class SalaryPaymentResponse(BaseModel):
    id: int
    organization_id: int
    employee_id: int
    salary_id: Optional[int]
    month: int
    year: int
    gross_amount: float
    deductions: float
    bonus: float
    net_amount: float
    paid_date: Optional[date]
    payment_method: Optional[str]
    status: str
    created_at: datetime

    class Config:
        from_attributes = True
