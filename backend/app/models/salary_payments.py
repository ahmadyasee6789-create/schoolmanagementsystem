from datetime import datetime
from sqlalchemy import (
    String, Integer, DateTime, ForeignKey, Date, Numeric, Column, UniqueConstraint
)
from sqlalchemy.orm import relationship
from app.db.base import Base

class SalaryPayment(Base):
    __tablename__ = "salary_payments"

    id = Column(Integer, primary_key=True, index=True)

    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)


    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)

    salary_id = Column(Integer, ForeignKey("staff_salaries.id"), nullable=True)
    session_id = Column(Integer, ForeignKey("academic_sessions.id"), nullable=False)

    month = Column(Integer, nullable=False)
    year = Column(Integer, nullable=False)

    gross_amount = Column(Numeric(10, 2), nullable=False)
    deductions = Column(Numeric(10, 2), default=0)
    bonus = Column(Numeric(10, 2), default=0)
    net_amount = Column(Numeric(10, 2), nullable=False)

    paid_date = Column(Date, nullable=True)
    payment_method = Column(String, nullable=True)
    status = Column(String, default="pending")

    created_at = Column(DateTime, default=datetime.utcnow)

    # relationships
    employee = relationship("Employee")
    salary = relationship("StaffSalary")
    session = relationship("AcademicSession", back_populates="salary_payments")

   