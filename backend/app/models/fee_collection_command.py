"""Idempotency/audit for collections, including operations that receive no cash."""
from sqlalchemy import (Column, Integer, String, JSON, DateTime, ForeignKey,
                        ForeignKeyConstraint, UniqueConstraint, CheckConstraint,
                        Index, func, event, DDL)
from app.db.base import Base
from app.db.fee_command_security_v1 import COMMAND_SECURITY_SQL


class FeeCollectionCommand(Base):
    __tablename__ = "fee_collection_commands"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, nullable=False)
    student_id = Column(Integer, nullable=False)
    session_id = Column(Integer, nullable=False)
    transaction_id = Column(Integer, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    idempotency_key = Column(String(128), nullable=False)
    request_fingerprint = Column(String(64), nullable=False)
    response_snapshot = Column(JSON(none_as_null=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("organization_id", "idempotency_key", name="uq_fee_command_key"),
        UniqueConstraint("id", "organization_id", "student_id", "session_id", name="uq_fee_command_owner"),
        CheckConstraint("length(request_fingerprint)=64", name="ck_fee_command_fingerprint"),
        ForeignKeyConstraint(["student_id", "organization_id"], ["students.id", "students.organization_id"],
                             name="fk_fee_command_student", ondelete="RESTRICT"),
        ForeignKeyConstraint(["session_id", "organization_id"], ["academic_sessions.id", "academic_sessions.organization_id"],
                             name="fk_fee_command_session", ondelete="RESTRICT"),
        ForeignKeyConstraint(["transaction_id", "organization_id", "student_id", "session_id"],
                             ["fee_transactions.id", "fee_transactions.organization_id", "fee_transactions.student_id", "fee_transactions.session_id"],
                             name="fk_fee_command_payment", ondelete="RESTRICT"),
        Index("ix_fee_command_owner", "organization_id", "student_id", "session_id"),
    )


for statement in COMMAND_SECURITY_SQL:
    event.listen(FeeCollectionCommand.__table__, "after_create", DDL(statement).execute_if(dialect="postgresql"))
