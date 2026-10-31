from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone
from jose import jwt
from typing import Optional
from app.security import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    REFRESH_TOKEN_EXPIRE_DAYS,
    get_signing_key,
)


# ---------------- Password Hashing ----------------
pwd_context = CryptContext(
    schemes=["argon2"],
    deprecated="auto"
)

def hash_password(password: str) -> str:
    if not isinstance(password, str):
        raise ValueError("Password must be a string")

    password = password.strip()

    if len(password) < 8:
        raise ValueError("Password too short")

    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    if not plain or not hashed:
        return False
    return pwd_context.verify(plain, hashed)

# ---------------- JWT ----------------
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    lifetime = expires_delta if expires_delta is not None else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    expire = datetime.now(timezone.utc) + lifetime
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, get_signing_key(), algorithm=ALGORITHM)

def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    lifetime = expires_delta if expires_delta is not None else timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    expire = datetime.now(timezone.utc) + lifetime
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, get_signing_key(), algorithm=ALGORITHM)
