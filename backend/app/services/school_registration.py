"""Policy and shared anti-abuse controls for the existing public signup route."""
import hashlib
import os

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from redis import RedisError

from app.db.redis import redis_client

SIGNUP_LIMIT = 5
SIGNUP_WINDOW = 900
SIGNUP_LIMIT_SCRIPT = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return {count, redis.call('TTL', KEYS[1])}
"""


def signup_enabled():
    # Public three-day trials already exist. Preserve that default; operators
    # can disable signup without changing login or existing organizations.
    return os.getenv('PUBLIC_SCHOOL_SIGNUP_ENABLED', 'true').strip().lower() in {'true', '1', 'yes'}


def signup_policy():
    return dict(enabled=signup_enabled(), trial_days=3, password_min_length=8, password_max_length=128,
                email_verification_supported=False, school_contact_fields=[])


def require_signup_access(request: Request):
    if not signup_enabled():
        raise HTTPException(403, 'Public school registration is currently unavailable. Contact the service administrator.')
    # Never trust arbitrary X-Forwarded-For. Uvicorn's trusted proxy settings
    # must resolve the actual client before this dependency runs.
    host = request.client.host if request.client else 'unknown'
    key = 'school-signup:v1:' + hashlib.sha256(host.encode('utf-8')).hexdigest()
    try:
        count, ttl = redis_client.eval(SIGNUP_LIMIT_SCRIPT, 1, key, SIGNUP_WINDOW)
    except RedisError:
        raise HTTPException(503, 'School registration is temporarily unavailable. Please try again later.') from None
    if int(count) > SIGNUP_LIMIT:
        raise HTTPException(429, 'Too many registration attempts. Please try again later.',
                            headers={'Retry-After': str(max(1, int(ttl)))})


class AuthValidationRoute(APIRoute):
    """Do not echo passwords or registration bodies in validation errors."""
    def get_route_handler(self):
        handler = super().get_route_handler()
        if self.endpoint.__name__ != 'signup':
            return handler

        async def safe_signup(request):
            try:
                return await handler(request)
            except RequestValidationError as exc:
                detail = [{key: error[key] for key in ('type', 'loc', 'msg')} for error in exc.errors()]
                raise HTTPException(422, detail=detail) from None
        return safe_signup
