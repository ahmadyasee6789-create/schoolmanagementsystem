# app/schemas/academic_session.py
from pydantic import BaseModel
from datetime import date
from typing import Optional

class AcademicSessionBase(BaseModel):
    name: str
    start_date: date  # Change from str to date
    end_date: date    # Change from str to date
    is_active: Optional[bool] = False

class AcademicSessionCreate(AcademicSessionBase):
    pass

class AcademicSessionOut(AcademicSessionBase):
    id: int
    organization_id: int
    
    class Config:
        from_attributes = True  # or orm_mode = True for older Pydantic