from app.db.base import Base
from sqlalchemy import Column, Integer, String, ForeignKey, Float, Numeric
from sqlalchemy.orm import relationship


class StudentFee(Base):
    __tablename__ = "student_fees"

    id = Column(Integer, primary_key=True)
    class_id = Column(Integer, ForeignKey("classrooms.id"), nullable=False)

    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    session_id = Column(Integer, ForeignKey("academic_sessions.id"), nullable=False)

    month = Column(String, nullable=False)

    # Fee Breakdown
    admission_fee = Column(Integer, default=0)
    monthly_fee = Column(Integer, default=0)

    exam_fee = Column(Integer, default=0)

    total_amount = Column(Integer, nullable=False)
    discount_percent = Column(Numeric(5,2), default=0)
    discount_amount = Column(Numeric, default=0)
    final_amount = Column(Numeric, default=0)
    paid_amount = Column(Integer, default=0)
    

    status = Column(String, default="unpaid")  # unpaid, partial, paid

    # Relationships
    student = relationship("Student", back_populates="fees")
    transactions = relationship(
        "FeeTransaction",
        back_populates="student_fee",
        cascade="all, delete-orphan"
    )
    classroom = relationship("Classroom", back_populates="student_fees")
    session= relationship("AcademicSession")
