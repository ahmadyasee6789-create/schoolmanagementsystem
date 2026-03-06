from pydantic import BaseModel

class RefreshTokenIn(BaseModel):
    refresh_token: str
    
from typing import Optional

class CurrentUser(BaseModel):
    id: int
    full_name: str
    email: str
    org_id: Optional[int]
    org_role: Optional[str]
