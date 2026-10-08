import unittest
from contextlib import ExitStack
from datetime import timedelta
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import rate_limit
from app.core.config import Settings
from app.core.security import create_access_token, create_pending_two_factor_token, hash_password, verify_password
from app.database.base import Base
from app.database.session import get_db
from app.main import app
from app.models.family import Family, FamilyMember
from app.models.two_factor import TwoFactorCode
from app.models.user import User
from app.services.password_reset_service import PURPOSE
from app.services.two_factor_service import _hash_code, utc_now


class PasswordResetTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine)
        def get_test_db():
            with self.sessions() as db:
                yield db
        app.dependency_overrides[get_db] = get_test_db
        rate_limit._BUCKETS.clear()
        self.settings = Settings(_env_file=None, database_url="sqlite://", email_dev_mode=True,
                                 jwt_secret_key="test-recovery-secret-with-more-than-thirty-two-characters")
        self.stack = ExitStack()
        for module in ("app.routes.auth", "app.core.security", "app.services.email_service",
                       "app.services.two_factor_service", "app.services.password_reset_service"):
            self.stack.enter_context(patch(f"{module}.get_settings", return_value=self.settings))
        self.delivery = self.stack.enter_context(patch("app.services.password_reset_service.send_two_factor_email"))
        self.stack.enter_context(patch("app.services.two_factor_service._generate_code", return_value="123456"))
        self.stack.enter_context(patch("app.services.password_reset_service._generate_code", return_value="123456"))
        self.client = TestClient(app)
        with self.sessions() as db:
            user = User(name="Recovery QA", username="recovery.qa", email="recovery@example.com",
                        hashed_password=hash_password("OldSynthetic123"), email_verified=False)
            other = User(name="Other QA", username="other.qa", email="other@example.com",
                         hashed_password=hash_password("OtherSynthetic123"))
            db.add_all([user, other]); db.flush()
            self.uid, self.other_uid = user.id, other.id
            family = Family(name="Recovery family", invite_code="RECOVERYQA", created_by_id=user.id)
            db.add(family); db.flush()
            self.family_id = family.id
            db.add(FamilyMember(family_id=family.id, user_id=user.id, role="owner"))
            db.commit()
        self.email = "recovery@example.com"

    def tearDown(self):
        self.stack.close()
        app.dependency_overrides.clear()
        rate_limit._BUCKETS.clear()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def request(self, email=None):
        return self.client.post("/api/auth/password/forgot", json={"email": email or self.email})

    def confirm(self, code="123456", email=None, password="NewSynthetic456"):  # gitleaks:allow - synthetic test credential
        return self.client.post("/api/auth/password/reset", json={
            "email": email or self.email, "code": code, "new_password": password,
        })

    def test_recovery_preserves_account_and_family_invalidates_session_and_requires_login(self):
        old_token = create_access_token(self.uid)
        self.assertEqual(self.request("RECOVERY@example.com").status_code, 200)
        self.assertEqual(self.delivery.call_args.args[2], PURPOSE)
        with self.sessions() as db:
            challenge = db.query(TwoFactorCode).one()
            self.assertNotEqual(challenge.code_hash, "123456")
        self.assertEqual(self.confirm().status_code, 204)
        with self.sessions() as db:
            user = db.get(User, self.uid)
            self.assertEqual(user.email, self.email)
            self.assertTrue(user.email_verified)
            self.assertEqual(user.token_version, 1)
            self.assertTrue(verify_password("NewSynthetic456", user.hashed_password))
            self.assertEqual(db.query(FamilyMember).filter_by(user_id=self.uid).count(), 1)
            self.assertIsNotNone(db.get(Family, self.family_id))
        self.assertEqual(self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {old_token}"}).status_code, 401)
        self.assertEqual(self.confirm().status_code, 400)
        for identifier in (self.email, "recovery.qa"):
            old = self.client.post("/api/auth/login", json={"identifier": identifier, "password": "OldSynthetic123"})  # gitleaks:allow - synthetic test credential
            self.assertEqual(old.status_code, 401)
            new = self.client.post("/api/auth/login", json={"identifier": identifier, "password": "NewSynthetic456"})  # gitleaks:allow - synthetic test credential
            self.assertEqual(new.status_code, 200, new.text)

    def test_unknown_inactive_and_cooldown_return_same_message_without_sending(self):
        known = self.request()
        unknown = self.request("missing@example.com")
        cooldown = self.request()
        with self.sessions() as db:
            db.get(User, self.other_uid).is_active = False; db.commit()
        inactive = self.request("other@example.com")
        self.assertEqual(known.json(), unknown.json())
        self.assertEqual(known.json(), cooldown.json())
        self.assertEqual(known.json(), inactive.json())
        self.assertEqual(self.delivery.call_count, 1)

    def test_expired_code_cannot_change_password(self):
        self.request()
        with self.sessions() as db:
            db.query(TwoFactorCode).one().expires_at = utc_now() - timedelta(seconds=1); db.commit()
        self.assertEqual(self.confirm().status_code, 400)

    def test_attempts_persist_and_lock_even_correct_code(self):
        self.request()
        for _ in range(5):
            self.assertEqual(self.confirm("999999").status_code, 400)
        self.assertEqual(self.confirm().status_code, 400)
        with self.sessions() as db:
            self.assertEqual(db.query(TwoFactorCode).one().attempts, 5)
            self.assertTrue(verify_password("OldSynthetic123", db.get(User, self.uid).hashed_password))

    def test_resend_invalidates_previous_code(self):
        self.request()
        with self.sessions() as db:
            code = db.query(TwoFactorCode).one()
            code.last_sent_at = utc_now() - timedelta(seconds=120); db.commit()
        with patch("app.services.password_reset_service._generate_code", return_value="654321"):
            self.assertEqual(self.request().status_code, 200)
        self.assertEqual(self.confirm().status_code, 400)
        self.assertEqual(self.confirm("654321").status_code, 204)

    def test_signup_code_cannot_reset_and_reset_code_cannot_login(self):
        with self.sessions() as db:
            challenge = TwoFactorCode(user_id=self.uid, purpose="signup", salt="test-salt",
                code_hash=_hash_code(self.uid, "signup", "test-salt", "123456"),
                expires_at=utc_now()+timedelta(minutes=10))
            db.add(challenge); db.commit()
        self.assertEqual(self.confirm().status_code, 400)
        self.request()
        with self.sessions() as db:
            challenge = db.query(TwoFactorCode).filter_by(purpose=PURPOSE).one()
            token = create_pending_two_factor_token(self.uid, challenge.id, PURPOSE)
        response = self.client.post("/api/auth/2fa/verify", json={"pending_token": token, "code": "123456"})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(self.confirm().status_code, 204)
        with self.sessions() as db:
            self.assertEqual(db.query(TwoFactorCode).filter(TwoFactorCode.consumed_at.is_(None)).count(), 0)

    def test_other_email_cannot_use_code(self):
        self.request()
        self.assertEqual(self.confirm(email="other@example.com").status_code, 400)
        self.assertEqual(self.confirm(email="missing@example.com").status_code, 400)

    def test_weak_password_does_not_consume_code(self):
        self.request()
        self.assertEqual(self.confirm(password="12345678").status_code, 422)
        self.assertEqual(self.confirm().status_code, 204)

    def test_unavailable_and_disabled_fail_closed(self):
        self.settings.password_reset_enabled = False
        self.assertEqual(self.request().status_code, 503)
        self.assertEqual(self.confirm().status_code, 503)
        self.settings.password_reset_enabled = True
        with patch("app.services.password_reset_service.two_factor_delivery_available", return_value=False):
            self.assertEqual(self.request().status_code, 503)
        self.delivery.assert_not_called()

    def test_delivery_failure_leaves_no_code_and_hides_account_existence(self):
        self.delivery.side_effect = HTTPException(503, "synthetic delivery failure")
        self.assertEqual(self.request().json(), self.request("missing@example.com").json())
        with self.sessions() as db:
            self.assertEqual(db.query(TwoFactorCode).count(), 0)

    def test_request_rate_limit(self):
        for _ in range(5):
            self.assertEqual(self.request("missing@example.com").status_code, 200)
        self.assertEqual(self.request("missing@example.com").status_code, 429)
