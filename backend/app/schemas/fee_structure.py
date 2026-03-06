from pydantic import BaseModel
from typing import Optional

class FeeStructureBase(BaseModel):
    class_id: int
    session_id: int
    monthly_fee: int
    admission_fee: Optional[int] = 0
    exam_fee: Optional[int] = 0

class FeeStructureCreate(FeeStructureBase):
    pass

class FeeStructureUpdate(FeeStructureBase):
    pass

class FeeStructureOut(FeeStructureBase):
    id: int
    class_name: Optional[str]  # Optional if you join with Class table

    class Config:
        orm_mode = True
