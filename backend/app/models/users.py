from sqlalchemy import (
    String, Boolean, ForeignKey, Text, DateTime, UniqueConstraint
)
from sqlalchemy.orm import (
    Mapped, mapped_column, relationship
)
from datetime import datetime
from typing import List, Optional
from app.db.base import Base
from app.models.students import Student


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    hashed_password: Mapped[Optional[str]] = mapped_column(String)
    is_superadmin:   Mapped[bool]     = mapped_column(Boolean, default=False)
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )

    

    organization_memberships = relationship(
    "OrganizationMember",
    back_populates="user",
    cascade="all, delete-orphan",
)


    



# Define OrganizationMember first
class OrganizationMember(Base):
    __tablename__ = "organization_members"
    __table_args__ = (
    UniqueConstraint("user_id", "organization_id"),
)

 
    id:Mapped[int] = mapped_column( primary_key=True, index=True)
    user_id:Mapped[int] = mapped_column( ForeignKey("users.id"), nullable=True)
    organization_id:Mapped[int] = mapped_column( ForeignKey("organizations.id"), nullable=False)
    role:Mapped[str] = mapped_column( String, nullable=False)

    user:Mapped["User"] = relationship(back_populates="organization_memberships")
    organization:Mapped["Organization"] = relationship( back_populates="members")
    class_subjects = relationship("ClassSubject", back_populates="teacher")
    classroom = relationship("Classroom", back_populates="class_teacher")


# Then define Organization
class Organization(Base):       
    __tablename__ = "organizations"
    id:Mapped[int] = mapped_column( primary_key=True, index=True)
    name:Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, default="trial")
    plan: Mapped[str] = mapped_column(String, default="trial")
    trial_ends_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    created_at:Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


    members:Mapped[List[OrganizationMember]] = relationship(
        
        back_populates="organization",
        cascade="all, delete-orphan"
    )
    students: Mapped[List["Student"]] = relationship(
    back_populates="organization",
    cascade="all, delete-orphan"
)
    fee_transactions = relationship(
    "FeeTransaction",
    back_populates="organization",
    cascade="all, delete-orphan"
)
    expenses=relationship(
        "Expense",
        back_populates="organization",
        cascade="all, delete-orphan"   )
    expense_categories=relationship(
        "ExpenseCategory",
        back_populates="organization",
        cascade="all, delete-orphan")
    exams=relationship(
        "Exam",
        back_populates="organization",
        cascade="all, delete-orphan")
    subjects=relationship(
        "Subject",
        back_populates="organization",
        cascade="all, delete-orphan")
    grades=relationship(
        "Grade",
        back_populates="organization",
        cascade="all, delete-orphan")
    classrooms=relationship(
        "Classroom",
        back_populates="organization",
        cascade="all, delete-orphan"
    )
    session=relationship(
        "AcademicSession",
        back_populates="organization",
        cascade="all, delete-orphan")
    terms=relationship(
        "Term",
        back_populates="organization",
        cascade="all, delete-orphan"    )
    employees=relationship(
        "Employee",
        back_populates="organization",
        cascade="all, delete-orphan"    )


     #invitations
class Invitation(Base):
    __tablename__ = "invitations"
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String, index=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"))
    role: Mapped[str] = mapped_column(String)
    token: Mapped[str] = mapped_column(String, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    accepted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
