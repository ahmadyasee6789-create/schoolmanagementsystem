from datetime import date
from pydantic import BaseModel
from typing import Optional
class StudentFeeCreate(BaseModel):
    student_id:int
    class_id:int
    amount:int
    month:str
    receipt_no:Optional[str]=None
class StudentFeeOut(BaseModel):
    id: int
    student_id: int
    class_id: int
    month: str
    total_amount: int
    paid_amount: int
    final_amount: int
    status: str

    class Config:
        orm_mode = True
class PaymentResponse(BaseModel):
    id: int
    student_id: int
    class_id: int
    month: str
    total_amount: int
    paid_amount: int
    status: str
    amount: int
    payment_date: date
    receipt_no: str

    class Config:
        orm_mode = True
class PaymentCreate(BaseModel):
    amount: int
    


