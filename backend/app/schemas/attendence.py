import datetime

from pydantic import BaseModel, Field
class AttendanceBase(BaseModel):
    student_id: int
    class_id: int

    status: str  # "present" | "absent" | "late"
class AttendanceCreate(AttendanceBase):
    date: datetime.date = Field(default_factory=datetime.date.today)
