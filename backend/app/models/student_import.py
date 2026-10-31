from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String

from app.db.base import Base


class StudentImportBatch(Base):
    """Private staging data; students are written only on confirmation."""

    __tablename__ = "student_import_batches"

    id = Column(String(36), primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    session_id = Column(Integer, ForeignKey("academic_sessions.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(255), nullable=False)
    status = Column(String(20), nullable=False, default="uploaded")
    raw_sheets = Column(JSON, nullable=False)
    validated_rows = Column(JSON, nullable=True)
    validation_id = Column(String(36), nullable=True)
    result = Column(JSON, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False, index=True)
