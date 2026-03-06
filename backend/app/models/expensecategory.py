from app.db.base import Base
from sqlalchemy import Integer,ForeignKey, Numeric,String,Column
from sqlalchemy.orm import relationship
class ExpenseCategory(Base):
    __tablename__ ="expense_categories"
    id=Column(Integer,primary_key=True,index=True)
    name=Column(String,nullable=False)
    organization_id=Column(Integer,ForeignKey("organizations.id"),nullable=False)
    organization=relationship("Organization",back_populates="expense_categories")
    expenses=relationship("Expense",back_populates="category")
   