# app/schemas/payroll.py

from pydantic import BaseModel, Field
from datetime import date, datetime
from typing import Optional


# ── Nested employee info (shown inside responses) ──
# This works only if StaffSalary model has a relationship to Employee
class EmployeeMini(BaseModel):
    id:        int
    full_name: str
    role:      str

    class Config:
        from_attributes = True


# ── CREATE salary structure ──
class StaffSalaryCreate(BaseModel):
    employee_id:    int              # ✅ fixed: was member_id
    base_salary:    float
    pay_frequency:  str = "monthly"
    effective_from: date
    effective_to:   Optional[date] = None


# ── UPDATE salary structure (all optional) ──
class StaffSalaryUpdate(BaseModel):
    base_salary:   Optional[float] = None
    pay_frequency: Optional[str]   = None
    effective_to:  Optional[date]  = None


# ── RESPONSE for salary structure ──
class StaffSalaryResponse(BaseModel):
    id:              int
    organization_id: int
    employee_id:     int              # ✅ fixed: was member_id
    employee:        EmployeeMini     # nested employee info
    base_salary:     float
    pay_frequency:   str
    effective_from:  date
    effective_to:    Optional[date]
    created_at:      datetime
    updated_at:      Optional[datetime]

    class Config:
        from_attributes = True


# ── GENERATE salary for one employee ──
class SalaryGenerate(BaseModel):
    employee_id: int                  # ✅ fixed: was member_id
    month:       int = Field(..., ge=1, le=12)
    year:        int


# ── PAY a salary (mark as paid) ──
class SalaryPay(BaseModel):
    payment_method: str
    deductions:     Optional[float] = 0
    bonus:          Optional[float] = 0


# ── RESPONSE for salary payment ──
class SalaryPaymentResponse(BaseModel):
    id:              int
    organization_id: int
    employee_id:     int              # ✅ fixed: removed member_id
    salary_id:       Optional[int]
    month:           int
    year:            int
    gross_amount:    float
    deductions:      float
    bonus:           float
    net_amount:      float
    paid_date:       Optional[date]
    payment_method:  Optional[str]
    status:          str
    created_at:      datetime
    employee:        EmployeeMini     # ✅ nested employee info

    class Config:
        from_attributes = True