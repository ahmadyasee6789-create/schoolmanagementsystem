from sqlalchemy import Column, Integer, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db.base import Base


class FeeStructure(Base):
    __tablename__ = "fee_structures"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classrooms.id"), nullable=False)
    session_id = Column(Integer, ForeignKey("academic_sessions.id"), nullable=False)

    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    
    
    admission_fee = Column(Numeric(10, 2), nullable=False)
    monthly_fee = Column(Numeric(10, 2), nullable=False)
    exam_fee = Column(Numeric(10, 2), nullable=False)

    # One fee structure per class per organization
    __table_args__ = (
        UniqueConstraint("organization_id", "class_id", "session_id", name="uq_fee_structure_org_class"),
    )

    # Relationships
    classroom = relationship("Classroom", back_populates="fee_structures")
    organization = relationship("Organization")
    session = relationship("AcademicSession")
