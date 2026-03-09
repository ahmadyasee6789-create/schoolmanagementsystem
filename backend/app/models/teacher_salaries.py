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


class TeacherSalary(Base):
    __tablename__ = "teacher_salaries"

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

    base_salary = Column(
        Numeric(10, 2),
        nullable=False
    )

    pay_frequency = Column(
        String,
        default="monthly"
    )

    effective_from = Column(Date, nullable=False)
    effective_to = Column(Date, nullable=True)

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )

    teacher = relationship("OrganizationMember")
    __table_args__ = (
        UniqueConstraint(
            "teacher_member_id",
            "effective_from",
            name="uq_teacher_salary_effective_from"
        ),
)