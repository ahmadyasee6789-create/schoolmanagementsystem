from pydantic import BaseModel
from typing import Optional
from datetime import date
class EmployeeCreate(BaseModel):
    full_name:str
    email:Optional[str]=None
    phone:Optional[str]=None
    role:Optional[str]=None
    joining_date:Optional[date]=None
    status:Optional[str]="active"

class EmployeeUpdate(BaseModel):
    full_name:Optional[str]=None
    email:Optional[str]=None
    phone:Optional[str]=None
    role:Optional[str]=None
    joining_date:Optional[date]=None
    status:Optional[str]=None
class EmployeeResponse(BaseModel):
    id:int
    full_name:str
    email:Optional[str]=None
    phone:Optional[str]=None
    role:Optional[str]=None
    joining_date:Optional[date]=None
    status:Optional[str]=None
    source:       Optional[str]  = "employee"

    class Config:
        from_attributes = True