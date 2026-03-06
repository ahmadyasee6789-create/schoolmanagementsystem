from datetime import datetime
from unicodedata import numeric

from app.db.base import Base
from sqlalchemy import DateTime, DateTime, Integer,ForeignKey, Numeric,String,Column,Float
from sqlalchemy.orm import relationship
class Expense(Base):
    __tablename__ = "expenses"
    id = Column(Integer,primary_key=True)
    organization_id=Column(Integer,ForeignKey("organizations.id"),nullable=False)
    category_id=Column(Integer,ForeignKey("expense_categories.id"),nullable=False)
    description=Column(String,nullable=True)
    amount=Column(Numeric(10,2),nullable=False)
    expense_date=Column(String,nullable=False)  
    created_by=Column(Integer,ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    organization=relationship("Organization",back_populates="expenses")
    category=relationship("ExpenseCategory",back_populates="expenses")

