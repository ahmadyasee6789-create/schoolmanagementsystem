from sqlalchemy import Column, Integer, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db.base import Base
class Grade(Base):
    __tablename__ = "grades"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    name = Column(String, nullable=False) 
    display_order = Column(Integer, default=0, nullable=False)  # for ordering grades in UI
    organization=relationship("Organization", back_populates="grades")
    classrooms = relationship("Classroom", back_populates="grade")  
    __table_args__ = (
    UniqueConstraint("organization_id", "name", name="unique_org_grade"),
)



class Classroom(Base):
    __tablename__ = "classrooms"

    id = Column(Integer, primary_key=True, index=True)

    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    


    grade_id = Column(Integer, ForeignKey("grades.id"), nullable=False)       # e.g. "5"
    section = Column(String, nullable=False)     # e.g. "A"

    class_teacher_member_id = Column(
    Integer,
    ForeignKey("organization_members.id"),
    nullable=True
)


    # Relationships
    
    attendances = relationship("Attendance", back_populates="classroom")
    fee_structures = relationship(
        "FeeStructure",
        back_populates="classroom",
        cascade="all, delete"
    )
    student_fees = relationship("StudentFee", back_populates="classroom")
    grade = relationship("Grade", back_populates="classrooms")
    
    class_teacher = relationship("OrganizationMember", back_populates="classroom")
    enrollments = relationship("StudentEnrollment", back_populates="classroom")
    organization = relationship("Organization", back_populates="classrooms")
    class_subjects = relationship("ClassSubject", back_populates="classroom")
    exam_papers = relationship("ExamPaper", back_populates="classroom")
    
    __table_args__ = (
    UniqueConstraint("grade_id", "organization_id", "section", name="unique_grade_section"),
)


def __repr__(self):
    return f"<Classroom id={self.id} section={self.section}>"