from pydantic import BaseModel, ConfigDict
from typing import Optional
class AttendanceBase(BaseModel):
    student_id: int
    class_id: int

    status: str  # "present" | "absent" | "late"
class AttendanceCreate(AttendanceBase):
    pass