from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

# -------------------------
# Base Schema
# -------------------------
class ExamPaperBase(BaseModel):
    exam_id: int
    classroom_id: int
    subject_id: int
    total_marks: int = Field(gt=0)
    pass_marks: int = Field(ge=0)

# -------------------------
# Create
# -------------------------
class ExamPaperCreate(ExamPaperBase):
    pass

# -------------------------
# Update
# -------------------------
class ExamPaperUpdate(BaseModel):
    total_marks: Optional[int] = Field(default=None, gt=0)
    pass_marks: Optional[int] = Field(default=None, ge=0)

# -------------------------
# Output
# -------------------------
class ExamPaperOut(BaseModel):
    id: int
    exam_id: int
    classroom_id: int
    subject_id: int
    total_marks: int
    pass_marks: int

    exam_name: Optional[str]=None
    classroom_name: Optional[str]=None
    subject_name: Optional[str]=None

    class Config:
        from_attributes = True