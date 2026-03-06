from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class SubjectBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)

class SubjectCreate(SubjectBase):
    pass  # Only name is needed for creation

class SubjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)

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