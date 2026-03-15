from datetime import datetime
from sqlalchemy import (
    String, Integer, DateTime, ForeignKey, Date, Numeric, Column, UniqueConstraint
)
from sqlalchemy.orm import relationship
from app.db.base import Base

class StaffSalary(Base):
    __tablename__ = "staff_salaries"

    id = Column(Integer, primary_key=True, index=True)

    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)

    # 👈 generalized member_id instead of teacher_member_id
    member_id = Column(Integer, ForeignKey("organization_members.id"), nullable=False)

    base_salary = Column(Numeric(10,2), nullable=False)

    pay_frequency = Column(String, default="monthly")

    effective_from = Column(Date, nullable=False)
    effective_to   = Column(Date, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    member = relationship("OrganizationMember")

    __table_args__ = (
        UniqueConstraint(
            "member_id",
            "effective_from",
            name="uq_member_salary_effective_from"
        ),
    )