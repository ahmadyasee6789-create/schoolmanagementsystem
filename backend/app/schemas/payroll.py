from pydantic import BaseModel,Field
from datetime import date, datetime
from typing import Optional
class TeacherSalaryCreate(BaseModel):
    member_id: int
    base_salary: float
    pay_frequency: str = "monthly"
    effective_from: date
    effective_to: Optional[date] = None
class TeacherSalaryUpdate(BaseModel):
    base_salary: Optional[float] = None
    pay_frequency: Optional[str] = None
    effective_to: Optional[date] = None
class TeacherSalaryResponse(BaseModel):
    id: int
    organization_id: int
    member_id: int
    base_salary: float
    pay_frequency: str
    effective_from: date
    effective_to: Optional[date]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True
class SalaryGenerate(BaseModel):
    member_id: int
    month: int = Field(..., ge=1,le=12)
    year: int
class SalaryPay(BaseModel):
    payment_method: str
    deductions: Optional[float] = 0
    bonus: Optional[float] = 0
class SalaryPaymentResponse(BaseModel):
    id: int
    organization_id: int
    member_id: int
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