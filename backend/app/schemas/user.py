from pydantic import BaseModel, EmailStr
from typing import Literal, Optional

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserCreate(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    organization_name: str
    
    

class UserOut(BaseModel):
    id: int
    full_name:str
    email: EmailStr
    organization_name: str
    
    

    class Config:
        from_attributes = True