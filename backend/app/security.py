"""JWT configuration shared by every token issuer and verifier."""

import os
from typing import Literal

from jose import JWTError, jwt


ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7


def get_signing_key() -> str:
    """Fail closed; provisioning a random production key is an operator task."""
    key = os.environ.get("SECRET_KEY")
    if (
        not key
        or len(key.encode("utf-8")) < 32
        or key != key.strip()
        or len(set(key)) < 8
        or key.lower().startswith(("your-secret", "change-me", "changeme"))
    ):
        raise RuntimeError(
            "SECRET_KEY must be configured with a securely generated signing key "
            "of at least 32 bytes; placeholder values are not allowed."
        )
    return key


def validate_security_configuration() -> None:
    get_signing_key()


def decode_token(token: str, expected_type: Literal["access", "refresh"]) -> dict:
    payload = jwt.decode(
        token,
        get_signing_key(),
        algorithms=[ALGORITHM],
        options={"require_exp": True},
    )
    user_id = payload.get("user_id")
    if (
        payload.get("type") != expected_type
        or isinstance(user_id, bool)
        or not isinstance(user_id, int)
        or user_id <= 0
    ):
        raise JWTError("Invalid token payload")
    return payload
