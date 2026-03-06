from pydantic import BaseModel
from datetime import date
from typing import Optional
from decimal import Decimal
class ExpenseCreate(BaseModel):
    category_id: int
    description: str
    amount: Decimal
    
class ExpenseCategoryCreate(BaseModel):
    name:str
class ExpenseCategoryOut(BaseModel):
    id: int
    name: str

    class Config:
        orm_mode = True



class ExpenseOut(BaseModel):
    
    id: int
    organization_id: int
    category: ExpenseCategoryOut  # nested schema
    description: Optional[str] = None
    amount: Decimal
    expense_date: date
    created_by: int

    class Config:
        orm_mode = True
