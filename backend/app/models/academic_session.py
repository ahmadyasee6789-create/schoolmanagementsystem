from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, Date,UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.base import Base

class AcademicSession(Base):
    __tablename__ = "academic_sessions"

    id = Column(Integer, primary_key=True)

    name = Column(String, nullable=False) 

    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)

    organization_id = Column(
        Integer,
        ForeignKey("organizations.id"),
        nullable=False
    )

    is_active = Column(Boolean, default=False)

    organization = relationship("Organization", back_populates="session")
    attendances = relationship("Attendance", back_populates="session")
    enrollments = relationship("StudentEnrollment", back_populates="session")
    salary_payments=relationship("SalaryPayment",back_populates="session")
    terms = relationship(
            "Term",
            back_populates="academic_year",
            cascade="all, delete-orphan"
        )
    subject=relationship("Subject",back_populates="session")
    expenses=relationship("Expense",back_populates="academic_year")
    classrooms = relationship("Classroom", back_populates="academic_year")
    __table_args__=(UniqueConstraint(
        "name",
        "organization_id",
        name="uq_session_name_org"
    ),
    )