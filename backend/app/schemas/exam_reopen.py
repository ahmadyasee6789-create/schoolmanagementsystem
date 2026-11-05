from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field
from app.schemas.exams import ExamOut


class ReopenExamRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    reason: str = Field(min_length=1, max_length=1000)


class ReopenExamOut(BaseModel):
    exam: ExamOut
    snapshot_id: int
    created_at: datetime


class ExamSnapshotSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    exam_id: int
    created_by: int
    created_at: datetime
    reason: str
    snapshot_sha256: str


class ExamSnapshotOut(ExamSnapshotSummary):
    snapshot: dict
