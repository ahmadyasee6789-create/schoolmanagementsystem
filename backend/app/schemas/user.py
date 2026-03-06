from pydantic import BaseModel, EmailStr
from typing import Literal, Optional

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserCreate(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    
    

class UserOut(BaseModel):
    id: int
    full_name:str
    email: EmailStr
    
    

    class Config:
        from_attributes = True