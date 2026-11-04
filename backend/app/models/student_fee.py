from app.db.base import Base
from sqlalchemy import Column, Integer, String, ForeignKey, Numeric, UniqueConstraint, CheckConstraint, Date, extract
from sqlalchemy.orm import relationship


class StudentFee(Base):
    __tablename__ = "student_fees"

    id = Column(Integer, primary_key=True)
    class_id = Column(Integer, ForeignKey("classrooms.id"), nullable=False)

    student_id = Column(Integer, ForeignKey("students.id", ondelete="RESTRICT"), nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    session_id = Column(Integer, ForeignKey("academic_sessions.id"), nullable=False)

    month = Column(String, nullable=False)
    # Retain the old display label; identity and ordering use this date.
    billing_period = Column(Date, nullable=False)

    # Fee Breakdown
    admission_fee = Column(Numeric(14, 2), default=0, nullable=False)
    monthly_fee = Column(Numeric(14, 2), default=0, nullable=False)

    exam_fee = Column(Numeric(14, 2), default=0, nullable=False)

    total_amount = Column(Numeric(14, 2), nullable=False)
    discount_percent = Column(Numeric(5,2), default=0, nullable=False)
    discount_amount = Column(Numeric(14, 2), default=0, nullable=False)
    final_amount = Column(Numeric(14, 2), default=0, nullable=False)
    paid_amount = Column(Numeric(14, 2), default=0, nullable=False)
    

    status = Column(String, default="unpaid", nullable=False)  # unpaid, partial, paid

    __table_args__ = (
        UniqueConstraint("organization_id", "student_id", "session_id", "billing_period", name="uq_student_fee_billing_period"),
        UniqueConstraint("id", "organization_id", "student_id", "session_id", name="uq_student_fee_allocation_owner"),
        CheckConstraint(extract("day", billing_period) == 1, name="ck_student_fee_period_start"),
        CheckConstraint("admission_fee BETWEEN 0 AND 999999999999.99 AND monthly_fee BETWEEN 0 AND 999999999999.99 AND exam_fee BETWEEN 0 AND 999999999999.99 AND total_amount BETWEEN 0 AND 999999999999.99", name="ck_student_fee_charges"),
        CheckConstraint("discount_percent >= 0 AND discount_percent <= 100", name="ck_student_fee_discount_percent"),
        CheckConstraint("total_amount = admission_fee + monthly_fee + exam_fee", name="ck_student_fee_gross"),
        CheckConstraint("discount_amount >= 0 AND discount_amount <= total_amount AND final_amount = total_amount - discount_amount", name="ck_student_fee_net"),
        CheckConstraint("paid_amount >= 0 AND paid_amount <= final_amount", name="ck_student_fee_paid"),
        CheckConstraint("status IN ('unpaid', 'partial', 'paid')", name="ck_student_fee_status"),
    )

    # Relationships
    student = relationship("Student", back_populates="fees")
    transactions = relationship(
        "FeeTransaction",
        back_populates="student_fee",
        cascade="save-update, merge",
        passive_deletes="all",
        foreign_keys="FeeTransaction.student_fee_id",
    )
    allocations = relationship("FeeAllocation", back_populates="student_fee",
                               foreign_keys="FeeAllocation.student_fee_id",
                               cascade="save-update, merge", passive_deletes="all")
    classroom = relationship("Classroom", back_populates="student_fees")
    session= relationship("AcademicSession")
