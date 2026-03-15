from app.db.base import Base
from sqlalchemy import Boolean, Column, Float, Index, Integer, String, Date, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
class Term(Base):
    __tablename__ = "terms"
    id = Column(Integer,primary_key=True,index=True)
    name=Column(String,nullable=False)
    academic_year_id=Column(Integer,ForeignKey("academic_sessions.id"),nullable=False)
    organization_id=Column(Integer,ForeignKey("organizations.id"),nullable=False)
    organization=relationship("Organization",back_populates="terms")
    academic_year=relationship("AcademicSession",back_populates="terms")
    exams=relationship("Exam",back_populates="term")
    __table_args__=(
    UniqueConstraint("academic_year_id", "name", "organization_id"),
)
class Exam(Base):
    __tablename__ = "exams"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    weightage = Column(Float,nullable=False, default=0.0)  # e.g. 0.4 for 40% of final grade
    is_published = Column(Boolean, default=False)
    is_locked = Column(Boolean, default=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    term_id = Column(Integer, ForeignKey("terms.id"), nullable=False)

    organization = relationship("Organization", back_populates="exams")
    term = relationship("Term", back_populates="exams")
    exam_papers = relationship("ExamPaper", back_populates="exam")
class Subject(Base):
    __tablename__="subjects"
    id=Column(Integer, primary_key=True, index=True)
    name=Column(String, nullable=False)
    organization_id=Column(Integer, ForeignKey("organizations.id"), nullable=False)
    session_id=Column(Integer,ForeignKey("academic_sessions.id"),nullable=False)
    organization = relationship("Organization", back_populates="subjects")
    class_subjects = relationship("ClassSubject", back_populates="subject")
    exam_papers = relationship("ExamPaper", back_populates="subject")
    session=relationship("AcademicSession",back_populates="subject")

class ClassSubject(Base):
    __tablename__="class_subjects"
    id=Column(Integer,primary_key=True,index=True)
    classroom_id=Column(Integer, ForeignKey("classrooms.id"), nullable=False)
    subject_id=Column(Integer, ForeignKey("subjects.id"), nullable=False)
    subject=relationship("Subject", back_populates="class_subjects")
    teacher_member_id = Column(
    Integer,
    ForeignKey("organization_members.id"),
    nullable=True
)

    teacher = relationship("OrganizationMember", back_populates="class_subjects")
    classroom=relationship("Classroom",back_populates="class_subjects")
    __table_args__ = (
    UniqueConstraint("classroom_id", "subject_id", name="uq_class_subject"),
)
class ExamPaper(Base):
    __tablename__ = "exam_papers"

    id = Column(Integer, primary_key=True, index=True)
    exam_id = Column(Integer, ForeignKey("exams.id"))
    classroom_id = Column(Integer, ForeignKey("classrooms.id"))
    subject_id = Column(Integer, ForeignKey("subjects.id"))

    total_marks = Column(Integer)
    pass_marks = Column(Integer)
    classroom = relationship("Classroom", back_populates="exam_papers")
    exam = relationship("Exam", back_populates="exam_papers")
    subject = relationship("Subject", back_populates="exam_papers")
    results = relationship("ExamResult", back_populates="exam_paper")
    __table_args__ = (
    UniqueConstraint("exam_id", "classroom_id", "subject_id", name="unique_exam_paper"),
)
class ExamResult(Base):
    __tablename__ = "exam_results"

    id = Column(Integer, primary_key=True, index=True)
    exam_paper_id = Column(Integer, ForeignKey("exam_papers.id"))
    student_enrollment_id = Column(Integer, ForeignKey("student_enrollments.id"), nullable=False)
    obtained_marks = Column(Integer)

    exam_paper = relationship("ExamPaper", back_populates="results")
    student_enrollment = relationship("StudentEnrollment", back_populates="exam_results")
    __table_args__ = (
    UniqueConstraint("exam_paper_id", "student_enrollment_id", name="unique_student_result"),
    Index("idx_exam_result_student", "student_enrollment_id"),
)
class GradeScale(Base):
    __tablename__ = "grade_scales"

    id = Column(Integer, primary_key=True)
    min_percentage = Column(Float, nullable=False)
    max_percentage = Column(Float, nullable=False)
    grade = Column(String, nullable=False)
    gpa = Column(Float, nullable=True)

    organization_id = Column(Integer, ForeignKey("organizations.id"))
    UniqueConstraint("organization_id", "min_percentage", "max_percentage")