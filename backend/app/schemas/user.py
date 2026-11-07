from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, field_validator, model_validator
from typing import Literal, Optional

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=150)
    email: EmailStr
    password: SecretStr = Field(min_length=8, max_length=128)
    organization_name: str = Field(min_length=1, max_length=200)
    # Older clients did not send this field. New forms always confirm it.
    confirm_password: Optional[SecretStr] = Field(default=None, exclude=True)
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)

    @field_validator("full_name", "organization_name", mode="before")
    @classmethod
    def trim_names(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("password")
    @classmethod
    def password_policy(cls, value):
        password = value.get_secret_value()
        if password != password.strip():
            raise ValueError("Password must not start or end with whitespace")
        return value

    @model_validator(mode="after")
    def passwords_match(self):
        if self.confirm_password is not None and self.password.get_secret_value() != self.confirm_password.get_secret_value():
            raise ValueError("Passwords do not match")
        return self
    
    

class UserOut(BaseModel):
    id: int
    full_name:str
    email: EmailStr
    organization_name: str
    
    

    class Config:
        from_attributes = True
