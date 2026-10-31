# app/models/student_enrollment.py
from sqlalchemy import Column, Numeric, Integer, ForeignKey, Date, Boolean, String, UniqueConstraint, CheckConstraint
from sqlalchemy.orm import relationship
from app.db.base import Base
from datetime import date

class StudentEnrollment(Base):
    __tablename__ = "student_enrollments"

    id = Column(Integer, primary_key=True)
    
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    session_id = Column(Integer, ForeignKey("academic_sessions.id"), nullable=False)

    classroom_id = Column(Integer, ForeignKey("classrooms.id"), nullable=True)
    roll_number = Column(String(20), nullable=True)
    discount_percent=Column(Numeric(5, 2), default=0, nullable=True)
    enrollment_date = Column(Date, default=date.today, nullable=False)
    withdrawal_date = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True)

    # Relationships
    student = relationship("Student", back_populates="enrollments")
    session = relationship("AcademicSession", back_populates="enrollments")
    classroom = relationship("Classroom", back_populates="enrollments")
    exam_results = relationship("ExamResult", back_populates="student_enrollment")

    __table_args__ = (
        CheckConstraint("discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100)", name="ck_enrollment_discount_percent"),
        UniqueConstraint(
            "student_id", 
            "session_id", 
            name="uq_student_session"
        ),
    )
