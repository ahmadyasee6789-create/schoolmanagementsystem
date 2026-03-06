from datetime import datetime
from sqlalchemy import (
    String,
    Integer,
    Boolean,
    DateTime,
    ForeignKey,
    Date,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class Student(Base):
    __tablename__ = "students"

    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "admission_no",
            name="uq_student_admission_per_org",
        ),
    )

    # -------------------------------
    # PRIMARY KEY
    # -------------------------------
    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    # -------------------------------
    # MULTI TENANCY
    # -------------------------------
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"),
        nullable=False,
        index=True,
    )

    # -------------------------------
    # CORE IDENTITY
    # -------------------------------
    admission_no: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    first_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    last_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    gender: Mapped[str] = mapped_column(
        String(10),
        nullable=True,
    )

    date_of_birth: Mapped[Date] = mapped_column(
        Date,
        nullable=True,
    )

    admission_date: Mapped[Date] = mapped_column(
        Date,
        nullable=True,
    )

    # -------------------------------
    # CONTACT
    # -------------------------------
    phone: Mapped[str] = mapped_column(
        String(20),
        nullable=True,
    )

    email: Mapped[str] = mapped_column(
        String(255),
        nullable=True,
    )

    address: Mapped[str] = mapped_column(
        String(500),
        nullable=True,
    )

    # -------------------------------
    # GUARDIAN INFO
    # -------------------------------
    father_name: Mapped[str] = mapped_column(
        String(255),
        nullable=True,
    )

    father_phone: Mapped[str] = mapped_column(
        String(20),
        nullable=True,
    )

    mother_name: Mapped[str] = mapped_column(
        String(255),
        nullable=True,
    )

    guardian_name: Mapped[str] = mapped_column(
        String(255),
        nullable=True,
    )

    guardian_phone: Mapped[str] = mapped_column(
        String(20),
        nullable=True,
    )

    # -------------------------------
    # STATUS & META
    # -------------------------------
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    # -------------------------------
    # RELATIONSHIPS
    # -------------------------------
    organization = relationship(
        "Organization",
        back_populates="students",
    )

    fees = relationship(
        "StudentFee",
        back_populates="student",
        cascade="all, delete",
    )

    attendances = relationship(
        "Attendance",
        back_populates="student",
        cascade="all, delete",
    )

    enrollments = relationship(
        "StudentEnrollment",
        back_populates="student",
        cascade="all, delete",
    )