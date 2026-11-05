from datetime import date
from pydantic import BaseModel, Field
from typing import Optional

class ExamBase(BaseModel):
    name: str = Field(..., example="Mid Term Exam")
    start_date: date
    end_date: date
    weightage: Optional[float] = 100
    is_published: Optional[bool] = False
    is_locked: Optional[bool] = False
    term_id: int

class ExamCreate(ExamBase):
    pass

class ExamUpdate(BaseModel):
    name: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    weightage: Optional[float] = None
    # Accepted for older clients; only dedicated lifecycle endpoints change status.
    is_published: Optional[bool] = None
    is_locked: Optional[bool] = None
    term_id: Optional[int] = None

class ExamOut(ExamBase):
    id: int
    organization_id: int

    class Config:
        orm_mode = True
