from sqlalchemy import (Column, Integer, Numeric, DateTime, ForeignKeyConstraint,
                        CheckConstraint, Index, func, event, DDL)
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.db.fee_allocation_security_v1 import ALLOCATION_SECURITY_SQL


class FeeAllocation(Base):
    """Application of an existing receipt; never new cash revenue."""
    __tablename__ = "fee_allocations"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, nullable=False)
    # Repeated ownership columns enforce matching tenant, student AND session.
    student_id = Column(Integer, nullable=False)
    session_id = Column(Integer, nullable=False)
    transaction_id = Column(Integer, nullable=False)
    student_fee_id = Column(Integer, nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    transaction = relationship("FeeTransaction", back_populates="allocations", foreign_keys=[transaction_id])
    student_fee = relationship("StudentFee", back_populates="allocations", foreign_keys=[student_fee_id])

    __table_args__ = (
        ForeignKeyConstraint(["transaction_id", "organization_id", "student_id", "session_id"],
                             ["fee_transactions.id", "fee_transactions.organization_id", "fee_transactions.student_id", "fee_transactions.session_id"],
                             name="fk_fee_allocation_payment_owner", ondelete="RESTRICT"),
        ForeignKeyConstraint(["student_fee_id", "organization_id", "student_id", "session_id"],
                             ["student_fees.id", "student_fees.organization_id", "student_fees.student_id", "student_fees.session_id"],
                             name="fk_fee_allocation_fee_owner", ondelete="RESTRICT"),
        CheckConstraint("amount > 0 AND amount <= 999999999999.99", name="ck_fee_allocation_amount"),
        Index("ix_fee_allocation_payment", "transaction_id"),
        Index("ix_fee_allocation_fee", "student_fee_id"),
        Index("ix_fee_allocation_owner", "organization_id", "student_id", "session_id"),
    )


# Keep isolated metadata-created PostgreSQL schemas as private as the migration.
for statement in ALLOCATION_SECURITY_SQL:
    event.listen(FeeAllocation.__table__, "after_create", DDL(statement).execute_if(dialect="postgresql"))
