from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from typing import Annotated, Optional, List
from datetime import datetime

SubjectName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class SubjectBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)

class SubjectCreate(SubjectBase):
    name: SubjectName

class SubjectUpdate(BaseModel):
    name: Optional[SubjectName] = None

class SubjectResponse(SubjectBase):
    id: int
    organization_id: int
    
    class Config:
        from_attributes = True

# For ClassSubject operations
class ClassSubjectBase(BaseModel):
    classroom_id: int
    subject_id: int
    teacher_member_id: Optional[int] = None

class ClassSubjectCreate(ClassSubjectBase):
    pass

class ClassSubjectResponse(BaseModel):
    id: int
    classroom_id: int
    subject_id: int
    teacher_member_id: Optional[int] = None
    classroom_name: Optional[str] = None   # Add this
    section: Optional[str] = None          # Add this
    subject_name: Optional[str] = None     # Add this
    teacher_name: Optional[str] = None     # Add this

    class Config:
        from_attributes = True


class BulkSubjectsCreate(BaseModel):
    names: list[SubjectName] = Field(min_length=1, max_length=500)
    model_config = ConfigDict(extra="forbid")


class SkippedSubject(BaseModel):
    name: str
    reason: str


class BulkSubjectsOut(BaseModel):
    created_count: int
    skipped_count: int
    created: list[SubjectResponse]
    skipped: list[SkippedSubject]


class BulkClassSubjectsCreate(BaseModel):
    classroom_id: int = Field(gt=0, strict=True)
    subject_ids: list[Annotated[int, Field(gt=0, strict=True)]] = Field(min_length=1, max_length=500)
    model_config = ConfigDict(extra="forbid")


class BulkClassSubjectsOut(BaseModel):
    assigned_count: int
    skipped_count: int
    assigned: list[ClassSubjectResponse]
    skipped: list[int]
