"""Security regression tests using disposable data and explicit test-only keys."""

import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi import HTTPException
from jose import JWTError, jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

# This deliberately public fixture is never an application default or deployment key.
TEST_KEY = "test-only-jwt-signing-fixture-0123456789-abcdef"
OTHER_TEST_KEY = "different-test-only-jwt-fixture-9876543210-fedcba"

with patch.dict(os.environ, {"DATABASE_URL": "sqlite://", "SECRET_KEY": TEST_KEY}):
    from app.routers import auth

import app.models
from app.db.base import Base
from app.models.users import Organization, OrganizationMember, User
from app.schemas.auth import RefreshTokenIn
from app.schemas.user import UserLogin
from app.security import decode_token, get_signing_key, validate_security_configuration
from app.utils.hash import create_access_token, create_refresh_token


class TokenConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {"SECRET_KEY": TEST_KEY})
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def test_missing_key_fails_closed_for_signing_and_verification(self):
        valid_token = create_access_token({"user_id": 1})
        with patch.dict(os.environ):
            os.environ.pop("SECRET_KEY", None)
            for operation in (
                validate_security_configuration,
                lambda: create_access_token({"user_id": 1}),
                lambda: create_refresh_token({"user_id": 1}),
                lambda: decode_token(valid_token, "access"),
            ):
                with self.subTest(operation=operation), self.assertRaises(RuntimeError):
                    operation()

    def test_application_startup_validates_configuration(self):
        # Drive the synchronous part of the async lifespan without opening sockets.
        with patch.dict(os.environ, {"DATABASE_URL": "sqlite://"}):
            from app.main import app, lifespan
        with patch.dict(os.environ):
            os.environ.pop("SECRET_KEY", None)
            startup = lifespan(app).__aenter__()
            with self.assertRaises(RuntimeError):
                startup.send(None)
        context = lifespan(app)
        with self.assertRaises(StopIteration):
            context.__aenter__().send(None)
        with self.assertRaises(StopIteration):
            context.__aexit__(None, None, None).send(None)

    def test_weak_and_placeholder_keys_are_rejected_without_disclosing_them(self):
        for key in ("", "your-secret-key", "a" * 64, "your-secret-key" * 4, " " + TEST_KEY):
            with self.subTest(key=key), patch.dict(os.environ, {"SECRET_KEY": key}):
                with self.assertRaises(RuntimeError) as caught:
                    get_signing_key()
                if key:
                    self.assertNotIn(key, str(caught.exception))

    def test_both_token_creators_use_the_mandatory_key_and_force_type(self):
        for creator, token_type in ((create_access_token, "access"), (create_refresh_token, "refresh")):
            with self.subTest(token_type=token_type):
                data = {"user_id": 1, "type": "incorrect"}
                token = creator(data)
                payload = jwt.decode(token, TEST_KEY, algorithms=["HS256"])
                self.assertEqual(payload["type"], token_type)
                self.assertEqual(data["type"], "incorrect")
                self.assertEqual(decode_token(token, token_type)["user_id"], 1)

    def test_different_key_and_algorithm_are_rejected(self):
        claims = {"user_id": 1, "type": "access", "exp": datetime.now(timezone.utc) + timedelta(minutes=1)}
        for key, algorithm in ((OTHER_TEST_KEY, "HS256"), (TEST_KEY, "HS512"), ("your-secret-key", "HS256")):
            with self.subTest(algorithm=algorithm, key=key), self.assertRaises(JWTError):
                decode_token(jwt.encode(claims, key, algorithm=algorithm), "access")

    def test_expiration_type_and_positive_integer_user_are_required(self):
        valid = {"user_id": 1, "type": "access", "exp": datetime.now(timezone.utc) + timedelta(minutes=1)}
        invalid_claims = [
            {key: value for key, value in valid.items() if key != "exp"},
            {key: value for key, value in valid.items() if key != "type"},
            {**valid, "type": "refresh"},
            *({**valid, "user_id": value} for value in (None, 0, -1, True, "1")),
        ]
        for claims in invalid_claims:
            with self.subTest(claims=claims), self.assertRaises(JWTError):
                decode_token(jwt.encode(claims, TEST_KEY, algorithm="HS256"), "access")
        with self.assertRaises(JWTError):
            decode_token(create_access_token({"user_id": 1}, timedelta(seconds=-1)), "access")

    def test_invitation_compatible_helper_adds_access_type(self):
        # The invitation route imports this symbol and supplies only user_id.
        token = auth.create_access_token(data={"user_id": 1})
        self.assertEqual(decode_token(token, "access")["type"], "access")


class AuthRouteSecurityTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {"SECRET_KEY": TEST_KEY})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        if os.environ.get('TEST_POSTGRES_URL'):
            from test_fee_postgres import isolated_postgres_engine
            self.engine = isolated_postgres_engine(self)
        else:
            self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.db.close)
        self.user = User(id=1, full_name="Test Accountant", email="accountant@example.com", hashed_password="test-hash", is_active=True)
        self.db.add_all([self.user, Organization(id=1, name="Test School", status="active")])
        self.db.flush()
        self.db.add(OrganizationMember(user_id=1, organization_id=1, role="accountant"))
        self.db.commit()

    def assert_unauthorized(self, operation):
        with self.assertRaises(HTTPException) as caught:
            operation()
        self.assertEqual(caught.exception.status_code, 401)

    def test_login_tokens_work_for_existing_response_contract(self):
        with patch.object(auth, "verify_password", return_value=True):
            result = auth.login(UserLogin(email=self.user.email, password="password"), db=self.db)
        self.assertEqual(result["expires_in"], 900)
        self.assertEqual(result["user"]["org_role"], "accountant")
        self.assertEqual(decode_token(result["access_token"], "access")["user_id"], 1)
        self.assertEqual(decode_token(result["refresh_token"], "refresh")["user_id"], 1)
        self.assertEqual(auth.get_current_user(token=result["access_token"], db=self.db).id, 1)

    def test_authorization_uses_live_database_role(self):
        token = create_access_token({"user_id": 1, "org_role": "admin", "org_id": 999})
        current_user = auth.get_current_user(token=token, db=self.db)
        self.assertEqual(current_user.org_id, 1)
        self.assertEqual(current_user.org_role, "accountant")
        self.assertEqual(auth.me(db=self.db, token=token)["org_role"], "accountant")

    def test_refresh_token_cannot_access_protected_user_endpoints(self):
        token = create_refresh_token({"user_id": 1})
        self.assert_unauthorized(lambda: auth.get_current_user(token=token, db=self.db))
        self.assert_unauthorized(lambda: auth.me(token=token, db=self.db))

    def test_access_token_cannot_be_exchanged_as_refresh_token(self):
        payload = RefreshTokenIn(refresh_token=create_access_token({"user_id": 1}))
        self.assert_unauthorized(lambda: auth.refresh_token(payload, db=self.db))

    def test_refresh_returns_usable_typed_access_and_refresh_tokens(self):
        payload = RefreshTokenIn(refresh_token=create_refresh_token({"user_id": 1}))
        result = auth.refresh_token(payload, db=self.db)
        self.assertEqual(decode_token(result["refresh_token"], "refresh")["user_id"], 1)
        self.assertEqual(auth.get_current_user(token=result["access_token"], db=self.db).id, 1)

    def test_inactive_users_cannot_login_access_me_or_refresh(self):
        access_token = create_access_token({"user_id": 1})
        refresh = RefreshTokenIn(refresh_token=create_refresh_token({"user_id": 1}))
        self.user.is_active = False
        self.db.commit()
        with patch.object(auth, "verify_password", return_value=True):
            self.assert_unauthorized(lambda: auth.login(UserLogin(email=self.user.email, password="password"), db=self.db))
        self.assert_unauthorized(lambda: auth.get_current_user(token=access_token, db=self.db))
        self.assert_unauthorized(lambda: auth.me(token=access_token, db=self.db))
        self.assert_unauthorized(lambda: auth.refresh_token(refresh, db=self.db))

    def test_deleted_or_unknown_users_cannot_access_or_refresh(self):
        token = create_access_token({"user_id": 999})
        refresh = RefreshTokenIn(refresh_token=create_refresh_token({"user_id": 999}))
        self.assert_unauthorized(lambda: auth.get_current_user(token=token, db=self.db))
        self.assert_unauthorized(lambda: auth.me(token=token, db=self.db))
        self.assert_unauthorized(lambda: auth.refresh_token(refresh, db=self.db))

    def test_typeless_legacy_tokens_are_rejected(self):
        token = jwt.encode({"user_id": 1, "exp": datetime.now(timezone.utc) + timedelta(minutes=1)}, TEST_KEY, algorithm="HS256")
        self.assert_unauthorized(lambda: auth.get_current_user(token=token, db=self.db))
        self.assert_unauthorized(lambda: auth.refresh_token(RefreshTokenIn(refresh_token=token), db=self.db))


if __name__ == "__main__":
    unittest.main()
