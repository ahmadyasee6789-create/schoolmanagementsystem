from sqlalchemy import Column, Integer, String, ForeignKey, Date, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.base import Base


class Attendance(Base):
    __tablename__ = "attendances"

    id = Column(Integer, primary_key=True)
    student_id = Column(Integer, ForeignKey("students.id"))
    class_id = Column(Integer, ForeignKey("classrooms.id"))
    date = Column(Date)
    status = Column(String)  # "present" | "absent" | "late"
    remarks = Column(String, nullable=True)
    # Relationships
    student = relationship("Student", back_populates="attendances")
    classroom = relationship("Classroom", back_populates="attendances")
    __table_args__ = (
    UniqueConstraint("student_id", "class_id", "date", name="unique_daily_attendance"),
)