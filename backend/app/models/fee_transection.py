from sqlalchemy import Column, Integer, ForeignKey, String, Date, UniqueConstraint, Numeric, CheckConstraint
from sqlalchemy.orm import relationship
from datetime import date


from app.db.base import Base


class FeeTransaction(Base):
    __tablename__ = "fee_transactions"

    id = Column(Integer, primary_key=True)
    student_fee_id = Column(Integer, ForeignKey("student_fees.id", ondelete="RESTRICT"), nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)

    amount = Column(Numeric(precision=14, scale=2), nullable=False)
    payment_date = Column(Date, default=date.today)
    receipt_no = Column(String, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"))
    # Legacy collections keep NULL keys/snapshots. New collections set all three.
    idempotency_key = Column(String(128), nullable=True)
    paid_amount_after = Column(Numeric(14, 2), nullable=True)
    fee_status_after = Column(String, nullable=True)
    student_fee = relationship("StudentFee", back_populates="transactions")
    organization = relationship("Organization", back_populates="fee_transactions")
    __table_args__ = (
    UniqueConstraint('receipt_no', 'organization_id', name='uq_receipt_per_org'),
    UniqueConstraint('organization_id', 'idempotency_key', name='uq_fee_payment_idempotency'),
    CheckConstraint('amount > 0 AND amount <= 999999999999.99', name='ck_fee_transaction_amount'),
    CheckConstraint("idempotency_key IS NULL OR (paid_amount_after IS NOT NULL AND paid_amount_after BETWEEN amount AND 999999999999.99 AND fee_status_after IS NOT NULL AND fee_status_after IN ('partial', 'paid'))", name='ck_fee_transaction_snapshot'),
)
