from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey, ForeignKeyConstraint, CheckConstraint, Index, event, DDL
from sqlalchemy.dialects.postgresql import JSONB

from app.db.base import Base
from app.db.exam_snapshot_security_v1 import EXAM_SNAPSHOT_SECURITY_SQL


class ExamReopenSnapshot(Base):
    __tablename__ = "exam_reopen_snapshots"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False)
    exam_id = Column(Integer, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)
    reason = Column(String(1000), nullable=False)
    snapshot = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=False)
    snapshot_sha256 = Column(String(64), nullable=False)

    __table_args__ = (
        ForeignKeyConstraint(["exam_id", "organization_id"], ["exams.id", "exams.organization_id"],
                             name="fk_exam_snapshot_owner", ondelete="RESTRICT"),
        CheckConstraint("length(trim(reason)) BETWEEN 1 AND 1000", name="ck_exam_snapshot_reason"),
        CheckConstraint("length(snapshot_sha256) = 64", name="ck_exam_snapshot_hash"),
        Index("ix_exam_snapshot_history", "organization_id", "exam_id", "id"),
    )


@event.listens_for(ExamReopenSnapshot, "before_update")
@event.listens_for(ExamReopenSnapshot, "before_delete")
def immutable_snapshot(*_args):
    raise ValueError("Examination snapshots are immutable")


for statement in EXAM_SNAPSHOT_SECURITY_SQL:
    event.listen(ExamReopenSnapshot.__table__, "after_create", DDL(statement).execute_if(dialect="postgresql"))
