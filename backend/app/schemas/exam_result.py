from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# -------------------------
# Base Schema
# -------------------------
class ExamResultBase(BaseModel):
    exam_paper_id: int
    student_enrollment_id: int
    obtained_marks: int = Field(ge=0)


# -------------------------
# Create
# -------------------------
class ExamResultCreate(ExamResultBase):
    pass


# -------------------------
# Update
# -------------------------
class ExamResultUpdate(BaseModel):
    marks_obtained: Optional[int] = Field(default=None, ge=0)


# -------------------------
# Output
# -------------------------
class ExamResultOut(BaseModel):
    id: int
    exam_paper_id: int
    student_enrollment_id: int
    obtained_marks: int
    grade: Optional[str]
    gpa: Optional[float]

    class Config:
        from_attributes = True