"""Immutable approved tuition-only annual settlement discount."""
from sqlalchemy import Column, Integer, Numeric, DateTime, ForeignKey, ForeignKeyConstraint, CheckConstraint, UniqueConstraint, func
from app.db.base import Base


class FeeYearlyDiscount(Base):
    __tablename__ = "fee_yearly_discounts"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, nullable=False)
    student_id = Column(Integer, nullable=False)
    session_id = Column(Integer, nullable=False)
    student_fee_id = Column(Integer, nullable=False)
    collection_command_id = Column(Integer, nullable=False)
    discount_percent = Column(Numeric(5, 2), nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    approved_by = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("student_fee_id", name="uq_fee_yearly_discount_fee"),
        ForeignKeyConstraint(["student_fee_id", "organization_id", "student_id", "session_id"],
                             ["student_fees.id", "student_fees.organization_id", "student_fees.student_id", "student_fees.session_id"],
                             name="fk_fee_yearly_discount_fee", ondelete="RESTRICT"),
        ForeignKeyConstraint(["collection_command_id", "organization_id", "student_id", "session_id"],
                             ["fee_collection_commands.id", "fee_collection_commands.organization_id", "fee_collection_commands.student_id", "fee_collection_commands.session_id"],
                             name="fk_fee_yearly_discount_command", ondelete="RESTRICT"),
        CheckConstraint("discount_percent > 0 AND discount_percent <= 100", name="ck_fee_yearly_discount_percent"),
        CheckConstraint("amount > 0 AND amount <= 999999999999.99", name="ck_fee_yearly_discount_amount"),
    )
