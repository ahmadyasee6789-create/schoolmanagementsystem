# schemas/fee_report.py
from pydantic import BaseModel
from typing import List, Optional

class FeeReportItem(BaseModel):
    id: int
    student_name: str
    admission_no: str
    grade_name: str
    section: str
    month: str
    admission_fee: float
    monthly_fee: float
    exam_fee: float
    discount_percent: float
    discount_amount: float
    total_amount: float
    final_amount: float
    paid_amount: float
    due_amount: float
    status: str  # paid | unpaid | partial

    class Config:
        from_attributes = True

class FeeReportResponse(BaseModel):
    items: List[FeeReportItem]
    total: int
    
    total_billed: float
    total_paid: float
    total_pending: float