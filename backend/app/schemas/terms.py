# app/schemas/term.py
from pydantic import BaseModel
from typing import Optional
from datetime import date

class TermBase(BaseModel):
    name: str
    academic_year_id: int

class TermCreate(TermBase):
    pass

class TermUpdate(BaseModel):
    name: Optional[str] = None
    academic_year_id: Optional[int] = None

class TermOut(TermBase):
    id: int
    organization_id: int

    class Config:
        orm_mode = True