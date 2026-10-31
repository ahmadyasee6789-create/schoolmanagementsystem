from pydantic import BaseModel, Field, field_validator
from datetime import date
from typing import Optional
from decimal import Decimal
class ExpenseCreate(BaseModel):
    category_id: int
    description: str
    amount: Decimal = Field(gt=0, max_digits=10, decimal_places=2, allow_inf_nan=False)

    @field_validator("amount", mode="before")
    @classmethod
    def reject_boolean_amount(cls, value):
        if isinstance(value, bool):
            raise ValueError("A monetary amount must be a number")
        return value
    
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
