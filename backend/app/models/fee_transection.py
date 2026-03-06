from sqlalchemy import Column, Integer, ForeignKey, String, Date, UniqueConstraint, Numeric
from sqlalchemy.orm import relationship
from datetime import date


from app.db.base import Base


class FeeTransaction(Base):
    __tablename__ = "fee_transactions"

    id = Column(Integer, primary_key=True)
    student_fee_id = Column(Integer, ForeignKey("student_fees.id"), nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)

    amount = Column(Numeric(precision=10, scale=2), nullable=False)
    payment_date = Column(Date, default=date.today)
    receipt_no = Column(String, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"))
    student_fee = relationship("StudentFee", back_populates="transactions")
    organization = relationship("Organization", back_populates="fee_transactions")
    __table_args__ = (
    UniqueConstraint('receipt_no', 'organization_id', name='uq_receipt_per_org'),
)
