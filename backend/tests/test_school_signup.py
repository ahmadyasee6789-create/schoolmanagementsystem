"""Registration regression writes use a guarded disposable PostgreSQL cluster."""
from concurrent.futures import ThreadPoolExecutor
import os
from threading import Barrier
import unittest
from unittest.mock import patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from redis import ConnectionError as RedisConnectionError
from sqlalchemy import event, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

import test_fee_integrity as fixture
from app.models.users import Organization, OrganizationMember, User
from app.models.classroom import Grade
from app.routers import auth
from app.schemas.user import UserCreate, UserLogin
from app.services import school_registration as policy
from app.security import decode_token
from app.utils.hash import verify_password

PASSWORD = 'SyntheticPassword2026!'
KEY = 'test-only-school-signup-key-0123456789-abcdef'


@unittest.skipUnless(os.environ.get('TEST_POSTGRES_URL'), 'Requires disposable PostgreSQL')
class SchoolSignupTests(unittest.TestCase):
    def setUp(self):
        fixture.FeeIntegrityTests.setUp(self)
        # Shared fixtures seed explicit IDs; advance only this disposable
        # schema's sequences before testing real registration inserts.
        for table in ('users', 'organizations', 'grades'):
            self.db.execute(text(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), (SELECT max(id) FROM {table}))"))
        self.db.commit()
        self.environment = patch.dict(os.environ, {'PUBLIC_SCHOOL_SIGNUP_ENABLED': 'true', 'SECRET_KEY': KEY})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.limit = patch.object(policy.redis_client, 'eval', return_value=[1, 900])
        self.rate = self.limit.start()
        self.addCleanup(self.limit.stop)
        app = FastAPI()
        app.include_router(auth.router)
        app.dependency_overrides[auth.get_db] = lambda: self.db
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.payload = dict(full_name='  Fixture Administrator  ', email='signup@example.com', password=PASSWORD,
                            confirm_password=PASSWORD, organization_name='  Fixture School  ')

    def register(self, **changes):
        return self.client.post('/auth/signup', json={**self.payload, **changes})

    def counts(self):
        return [self.db.query(model).count() for model in (User, Organization, OrganizationMember, Grade)]

    def test_success_creates_one_isolated_admin_and_preserves_trial_policy(self):
        commits = []
        def count(_db): commits.append(1)
        event.listen(self.db, 'after_commit', count)
        try:
            response = self.register()
        finally:
            event.remove(self.db, 'after_commit', count)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(commits), 1)
        data = response.json()
        user = self.db.get(User, data['user_id'])
        org = self.db.get(Organization, data['organization_id'])
        membership = self.db.query(OrganizationMember).filter_by(user_id=user.id).one()
        self.assertEqual((membership.organization_id, membership.role), (org.id, 'admin'))
        self.assertFalse(user.is_superadmin)
        self.assertEqual(user.full_name, 'Fixture Administrator')
        self.assertEqual(org.name, 'Fixture School')
        self.assertEqual((org.status, org.plan), ('trial', 'trial'))
        self.assertIsNotNone(org.trial_ends_at)
        self.assertTrue(user.hashed_password.startswith('$argon2'))
        self.assertTrue(verify_password(PASSWORD, user.hashed_password))
        self.assertNotIn(PASSWORD, response.text)
        self.assertNotIn('access_token', data)
        self.assertFalse(self.client.get('/auth/signup-policy').json()['email_verification_supported'])
        self.assertEqual(self.db.get(Organization, 1).name, 'Synthetic School')

    def test_duplicate_email_and_case_variants_do_not_create_or_link_another_school(self):
        self.assertEqual(self.register().status_code, 200)
        before = self.counts()
        for email in ('signup@example.com', 'SIGNUP@example.com'):
            self.assertEqual(self.register(email=email).status_code, 400)
            self.assertEqual(self.counts(), before)

    def test_legacy_registration_payload_and_public_policy_remain_compatible(self):
        response = self.client.post('/auth/signup', json={key: value for key, value in self.payload.items() if key != 'confirm_password'})
        self.assertEqual(response.status_code, 200, response.text)
        policy_response = self.client.get('/auth/signup-policy')
        self.assertTrue(policy_response.json()['enabled'])
        self.assertEqual(policy_response.headers['cache-control'], 'no-store')

    def test_invalid_email_names_passwords_and_confirmation_are_rejected_without_echoing_passwords(self):
        before = self.counts()
        for invalid in ({'email': 'invalid'}, {'full_name': '   '}, {'organization_name': ''},
                        {'password': 'short'}, {'password': 'x'*129}, {'password': ' spacePass '},
                        {'confirm_password': 'different-secret'}):
            with self.subTest(fields=list(invalid)):
                response = self.register(**invalid)
                self.assertEqual(response.status_code, 422, response.text)
                self.assertNotIn(PASSWORD, response.text)
                self.assertTrue(all('input' not in error for error in response.json()['detail']))
                self.assertEqual(self.counts(), before)
        self.assertNotIn(PASSWORD, repr(UserCreate(**self.payload)))

    def test_privileged_and_unsupported_fields_are_rejected(self):
        for field, value in (('organization_id', 1), ('is_superadmin', True), ('role', 'superadmin'),
                             ('permissions', ['all']), ('plan', 'premium'), ('status', 'active'), ('school_phone', '123')):
            before = self.counts()
            response = self.register(**{field: value})
            self.assertEqual(response.status_code, 422)
            self.assertEqual(self.counts(), before)

    def test_public_registration_can_be_disabled_before_database_or_redis_access(self):
        before = self.counts()
        with patch.dict(os.environ, {'PUBLIC_SCHOOL_SIGNUP_ENABLED': 'false'}):
            self.assertFalse(self.client.get('/auth/signup-policy').json()['enabled'])
            self.assertEqual(self.register().status_code, 403)
        self.rate.assert_not_called()
        self.assertEqual(self.counts(), before)

    def test_rate_limit_and_redis_failure_fail_closed_without_writes(self):
        before = self.counts()
        self.rate.return_value = [6, 42]
        response = self.register()
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers['retry-after'], '42')
        self.assertNotIn('signup@example.com', str(self.rate.call_args))
        self.assertNotIn(PASSWORD, str(self.rate.call_args))
        self.rate.side_effect = RedisConnectionError('fixture')
        self.assertEqual(self.register().status_code, 503)
        self.assertEqual(self.counts(), before)

    def test_failure_after_grade_seeding_rolls_back_user_school_and_grades(self):
        before = self.counts()
        real_seed = auth.seed_grades
        def failed_seed(*args):
            real_seed(*args)
            raise SQLAlchemyError('fixture failure after seeded grades')
        with patch.object(auth, 'seed_grades', side_effect=failed_seed):
            self.assertEqual(self.register().status_code, 503)
        self.assertEqual(self.counts(), before)

    def test_membership_insert_failure_rolls_back_all_registration_records(self):
        before = self.counts()
        def fail(_mapper, _connection, _target):
            raise SQLAlchemyError('fixture membership failure')
        event.listen(OrganizationMember, 'before_insert', fail)
        try:
            response = self.register()
        finally:
            event.remove(OrganizationMember, 'before_insert', fail)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.counts(), before)

    def test_new_admin_can_login_and_has_only_the_new_organization(self):
        registered = self.register().json()
        login = self.client.post('/auth/login', json={'email': self.payload['email'], 'password': PASSWORD})
        self.assertEqual(login.status_code, 200, login.text)
        data = login.json()
        self.assertEqual(data['user']['org_id'], registered['organization_id'])
        self.assertEqual(data['user']['org_role'], 'admin')
        self.assertFalse(data['user']['is_superadmin'])
        me = self.client.get('/auth/me', headers={'Authorization': f'Bearer {data["access_token"]}'}).json()
        self.assertEqual(me['org_id'], registered['organization_id'])
        self.assertFalse(me['is_superadmin'])
        self.assertEqual(decode_token(data['access_token'], 'access')['org_id'], registered['organization_id'])

    def test_concurrent_duplicate_registrations_create_only_one_complete_school(self):
        barrier = Barrier(2)
        before = self.counts()
        self.db.rollback()
        def register(email):
            with Session(self.engine) as db:
                payload = UserCreate(**{**self.payload, 'email': email})
                barrier.wait(timeout=10)
                try:
                    return auth.signup(payload, db)
                except HTTPException as error:
                    return error.status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(register, ('race@example.com', 'RACE@example.com')))
        self.assertEqual(sum(isinstance(result, dict) for result in results), 1)
        self.assertIn(400, results)
        self.assertEqual(self.db.query(User).count(), before[0]+1)
        self.assertEqual(self.db.query(Organization).count(), before[1]+1)
        self.assertEqual(self.db.query(OrganizationMember).count(), before[2]+1)
