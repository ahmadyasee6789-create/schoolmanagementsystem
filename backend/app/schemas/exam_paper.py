from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Optional
from datetime import datetime

# -------------------------
# Base Schema
# -------------------------
class ExamPaperMarks(BaseModel):
    total_marks: int = Field(gt=0)
    pass_marks: int = Field(ge=0)

    @model_validator(mode="after")
    def valid_marks(self):
        if self.pass_marks > self.total_marks:
            raise ValueError("Pass marks cannot exceed total marks")
        return self


class ExamPaperBase(ExamPaperMarks):
    exam_id: int
    classroom_id: int
    subject_id: int

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

    @model_validator(mode="after")
    def valid_marks(self):
        if self.total_marks is not None and self.pass_marks is not None and self.pass_marks > self.total_marks:
            raise ValueError("Pass marks cannot exceed total marks")
        return self


class BulkExamPaperItem(ExamPaperMarks):
    subject_id: int = Field(gt=0)
    total_marks: int = Field(gt=0, strict=True)
    pass_marks: int = Field(ge=0, strict=True)

    model_config = ConfigDict(extra="forbid")


class BulkExamPaperCreate(BaseModel):
    exam_id: int = Field(gt=0)
    classroom_id: int = Field(gt=0)
    papers: list[BulkExamPaperItem] = Field(min_length=1, max_length=200)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def unique_subjects(self):
        subjects = [paper.subject_id for paper in self.papers]
        if len(subjects) != len(set(subjects)):
            raise ValueError("Select each subject only once")
        return self

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


class BulkExamPaperOut(BaseModel):
    created_count: int
    skipped_count: int
    created: list[ExamPaperOut]
    skipped: list[ExamPaperOut]
