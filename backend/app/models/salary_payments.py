from datetime import datetime
from sqlalchemy import (
    String,
    Integer,
    DateTime,
    ForeignKey,
    Date,
    Numeric,
    Column,
    UniqueConstraint
)
from sqlalchemy.orm import relationship
from app.db.base import Base


class SalaryPayment(Base):
    __tablename__ = "salary_payments"

    id = Column(Integer, primary_key=True, index=True)

    organization_id = Column(
        Integer,
        ForeignKey("organizations.id"),
        nullable=False
    )

    teacher_member_id = Column(
        Integer,
        ForeignKey("organization_members.id"),
        nullable=False
    )

    salary_id = Column(
        Integer,
        ForeignKey("teacher_salaries.id"),
        nullable=True
    )

    month = Column(Integer, nullable=False)   # 1-12
    year = Column(Integer, nullable=False)

    gross_amount = Column(Numeric(10, 2), nullable=False)

    deductions = Column(Numeric(10, 2), default=0)
    bonus = Column(Numeric(10, 2), default=0)

    net_amount = Column(Numeric(10, 2), nullable=False)

    paid_date = Column(Date, nullable=True)

    payment_method = Column(String, nullable=True)  # cash, bank, etc
    status = Column(String, default="pending")      # pending / paid

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    teacher = relationship("OrganizationMember")
    salary = relationship("TeacherSalary")
    __table_args__ = (
    UniqueConstraint(
        "teacher_member_id",
        "month",
        "year",
        name="uq_teacher_salary_month"
    ),
)