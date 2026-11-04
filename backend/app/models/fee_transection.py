from sqlalchemy import (Column, Integer, ForeignKey, ForeignKeyConstraint, String, Date,
                        UniqueConstraint, Numeric, CheckConstraint, JSON, Index)
from sqlalchemy.orm import relationship
from datetime import date


from app.db.base import Base


class FeeTransaction(Base):
    __tablename__ = "fee_transactions"

    id = Column(Integer, primary_key=True)
    # Legacy compatibility pointer; allocations are the source of applied amounts.
    student_fee_id = Column(Integer, nullable=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    student_id = Column(Integer, nullable=False)
    session_id = Column(Integer, nullable=False)

    amount = Column(Numeric(precision=14, scale=2), nullable=False)
    payment_date = Column(Date, default=date.today)
    receipt_no = Column(String, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"))
    # Legacy collections keep NULL keys/snapshots. New collections set all three.
    idempotency_key = Column(String(128), nullable=True)
    paid_amount_after = Column(Numeric(14, 2), nullable=True)
    fee_status_after = Column(String, nullable=True)
    # Versioned request hash and allowlisted response/receipt; no credentials.
    # Multi-month receipts retain names at issue for historical accuracy.
    request_fingerprint = Column(String(64), nullable=True)
    response_snapshot = Column(JSON(none_as_null=True), nullable=True)
    student_fee = relationship("StudentFee", back_populates="transactions", foreign_keys=[student_fee_id])
    organization = relationship("Organization", back_populates="fee_transactions", foreign_keys=[organization_id])
    allocations = relationship("FeeAllocation", back_populates="transaction",
                               foreign_keys="FeeAllocation.transaction_id",
                               cascade="save-update, merge", passive_deletes="all")
    __table_args__ = (
        UniqueConstraint('receipt_no', 'organization_id', name='uq_receipt_per_org'),
        UniqueConstraint('organization_id', 'idempotency_key', name='uq_fee_payment_idempotency'),
        CheckConstraint('amount > 0 AND amount <= 999999999999.99', name='ck_fee_transaction_amount'),
        UniqueConstraint("id", "organization_id", "student_id", "session_id", name="uq_fee_transaction_allocation_owner"),
        ForeignKeyConstraint(["student_id", "organization_id"], ["students.id", "students.organization_id"],
                             name="fk_fee_transaction_student_owner", ondelete="RESTRICT"),
        ForeignKeyConstraint(["session_id", "organization_id"], ["academic_sessions.id", "academic_sessions.organization_id"],
                             name="fk_fee_transaction_session_owner", ondelete="RESTRICT"),
        ForeignKeyConstraint(["student_fee_id", "organization_id", "student_id", "session_id"],
                             ["student_fees.id", "student_fees.organization_id", "student_fees.student_id", "student_fees.session_id"],
                             name="fk_fee_transaction_fee_history", ondelete="RESTRICT"),
        CheckConstraint("request_fingerprint IS NULL OR length(request_fingerprint) = 64", name="ck_fee_request_fingerprint"),
        CheckConstraint("idempotency_key IS NULL OR "
                        "(student_fee_id IS NOT NULL AND paid_amount_after IS NOT NULL "
                        "AND paid_amount_after BETWEEN amount AND 999999999999.99 "
                        "AND fee_status_after IS NOT NULL AND fee_status_after IN ('partial', 'paid')) OR "
                        "(student_fee_id IS NULL AND request_fingerprint IS NOT NULL AND response_snapshot IS NOT NULL)",
                        name="ck_fee_transaction_snapshot"),
        Index("ix_fee_transaction_owner", "organization_id", "student_id", "session_id"),
    )
