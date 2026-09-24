import unittest
from contextlib import contextmanager
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import rate_limit
from app.core.config import Settings
from app.core.security import hash_password
from app.database.base import Base
from app.database.session import get_db
from app.main import app
from app.models.two_factor import TwoFactorCode
from app.models.user import User
from app.schemas.user import UserLogin
from app.services.email_service import two_factor_delivery_available


FALLBACK_SETTINGS = Settings(
    _env_file=None,
    database_url="sqlite://",
    jwt_secret_key="test-jwt-secret-with-more-than-thirty-two-characters",
    two_factor_hmac_secret="test-hmac-secret-with-more-than-thirty-two-characters",
    email_dev_mode=False,
)

DEV_SETTINGS = Settings(
    _env_file=None,
    database_url="sqlite://",
    jwt_secret_key="test-jwt-secret-with-more-than-thirty-two-characters",
    two_factor_hmac_secret="test-hmac-secret-with-more-than-thirty-two-characters",
    email_dev_mode=True,
)


@contextmanager
def auth_runtime(settings):
    with (
        patch("app.routes.auth.get_settings", return_value=settings),
        patch("app.services.two_factor_service.get_settings", return_value=settings),
        patch("app.services.email_service.get_settings", return_value=settings),
        patch("app.core.security.get_settings", return_value=settings),
        patch("app.services.email_service.logger.warning"),
    ):
        yield


class AuthDeliveryFallbackTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

        def override_get_db():
            db = self.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)
        rate_limit._BUCKETS.clear()

    def tearDown(self):
        rate_limit._BUCKETS.clear()
        app.dependency_overrides.clear()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def seed_user(self, **overrides):
        values = {
            "id": "fallback-user",
            "name": "Usuario Fallback",
            "username": "usuario.fallback",
            "email": "fallback@example.com",
            "hashed_password": hash_password("LegacyPass1"),  # gitleaks:allow - synthetic test credential
            "email_verified": True,
            "is_active": True,
        }
        values.update(overrides)
        db = self.SessionLocal()
        try:
            db.add(User(**values))
            db.commit()
        finally:
            db.close()

    def test_two_factor_delivery_available_reflects_configured_channels(self):
        with patch("app.services.email_service.get_settings", return_value=FALLBACK_SETTINGS):
            self.assertFalse(two_factor_delivery_available())
        with patch("app.services.email_service.get_settings", return_value=DEV_SETTINGS):
            self.assertTrue(two_factor_delivery_available())
        smtp_settings = FALLBACK_SETTINGS.model_copy(update={"smtp_host": "smtp.example.com"})
        with patch("app.services.email_service.get_settings", return_value=smtp_settings):
            self.assertTrue(two_factor_delivery_available())
        http_settings = FALLBACK_SETTINGS.model_copy(
            update={
                "email_delivery_http_url": "https://example.test/deliver",
                "email_delivery_http_token": "test-token-" + ("x" * 40),
            }
        )
        with patch("app.services.email_service.get_settings", return_value=http_settings):
            self.assertTrue(two_factor_delivery_available())

    def test_login_without_delivery_channel_skips_two_factor_and_verifies_email(self):
        self.seed_user(email_verified=False)
        with auth_runtime(FALLBACK_SETTINGS):
            login = self.client.post(
                "/api/auth/login",
                json={"identifier": "fallback@example.com", "password": "LegacyPass1"},
            )
        self.assertEqual(login.status_code, 200, login.text)
        payload = login.json()
        self.assertIn("access_token", payload)
        self.assertNotIn("requires_two_factor", payload)
        self.assertTrue(payload["user"]["email_verified"])

        with auth_runtime(FALLBACK_SETTINGS):
            session = self.client.get(
                "/api/auth/me",
                headers={"Authorization": f"Bearer {payload['access_token']}"},
            )
        self.assertEqual(session.status_code, 200, session.text)

        db = self.SessionLocal()
        try:
            user = db.query(User).filter(User.email == "fallback@example.com").one()
            self.assertTrue(user.email_verified)
            self.assertIsNotNone(user.last_login_at)
            self.assertEqual(db.query(TwoFactorCode).count(), 0)
        finally:
            db.close()

    def test_login_with_dev_channel_still_requires_two_factor(self):
        self.seed_user()
        with auth_runtime(DEV_SETTINGS):
            login = self.client.post(
                "/api/auth/login",
                json={"identifier": "fallback@example.com", "password": "LegacyPass1"},
            )
        self.assertEqual(login.status_code, 200, login.text)
        pending = login.json()
        self.assertTrue(pending["requires_two_factor"])
        self.assertEqual(pending["delivery_mode"], "development")

        with auth_runtime(DEV_SETTINGS):
            verified = self.client.post(
                "/api/auth/2fa/verify",
                json={"pending_token": pending["pending_token"], "code": "000000"},
            )
        self.assertEqual(verified.status_code, 200, verified.text)
        self.assertIn("access_token", verified.json())

    def test_signup_without_delivery_channel_creates_verified_account(self):
        with auth_runtime(FALLBACK_SETTINGS):
            registration = self.client.post(
                "/api/auth/register",
                json={
                    "name": "Fallback Novo",
                    "username": "fallback.novo",
                    "email": "novo@example.com",
                    "password": "StrongPass123",
                },
            )
        self.assertEqual(registration.status_code, 201, registration.text)
        payload = registration.json()
        self.assertIn("access_token", payload)
        self.assertNotIn("requires_two_factor", payload)
        self.assertTrue(payload["user"]["email_verified"])

        db = self.SessionLocal()
        try:
            user = db.query(User).filter(User.email == "novo@example.com").one()
            self.assertTrue(user.email_verified)
            self.assertIsNotNone(user.email_verified_at)
        finally:
            db.close()

    def test_login_accepts_legacy_short_password(self):
        self.seed_user(
            email="legacy.short@example.com",
            username="legacy.short",
            hashed_password=hash_password("abc123"),  # gitleaks:allow - synthetic test credential
        )
        payload = UserLogin(identifier="legacy.short@example.com", password="abc123")  # gitleaks:allow - synthetic test credential
        self.assertEqual(payload.password, "abc123")

        with auth_runtime(FALLBACK_SETTINGS):
            login = self.client.post(
                "/api/auth/login",
                json={"identifier": "legacy.short@example.com", "password": "abc123"},
            )
        self.assertEqual(login.status_code, 200, login.text)
        self.assertIn("access_token", login.json())

    def test_login_can_request_new_challenge_within_resend_cooldown(self):
        self.seed_user()
        with auth_runtime(DEV_SETTINGS):
            first = self.client.post(
                "/api/auth/login",
                json={"identifier": "fallback@example.com", "password": "LegacyPass1"},
            )
            second = self.client.post(
                "/api/auth/login",
                json={"identifier": "fallback@example.com", "password": "LegacyPass1"},
            )
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(second.status_code, 200, second.text)
        self.assertTrue(first.json()["requires_two_factor"])
        self.assertTrue(second.json()["requires_two_factor"])
        self.assertNotEqual(first.json()["pending_token"], second.json()["pending_token"])

    def test_two_factor_expiry_is_serialized_with_timezone(self):
        self.seed_user()
        with auth_runtime(DEV_SETTINGS):
            login = self.client.post(
                "/api/auth/login",
                json={"identifier": "fallback@example.com", "password": "LegacyPass1"},
            )
        expires_at = login.json()["expires_at"]
        self.assertTrue(expires_at.endswith("+00:00") or expires_at.endswith("Z"), expires_at)

    def test_email_change_rejected_without_delivery_channel(self):
        self.seed_user()
        with auth_runtime(FALLBACK_SETTINGS):
            login = self.client.post(
                "/api/auth/login",
                json={"identifier": "fallback@example.com", "password": "LegacyPass1"},
            )
            token = login.json()["access_token"]
            changed = self.client.patch(
                "/api/auth/me",
                headers={"Authorization": f"Bearer {token}"},
                json={"email": "troca@example.com", "current_password": "LegacyPass1"},
            )
        self.assertEqual(changed.status_code, 400, changed.text)
        self.assertIn("verificacao", changed.json()["detail"].lower())

        db = self.SessionLocal()
        try:
            user = db.query(User).filter(User.id == "fallback-user").one()
            self.assertEqual(user.email, "fallback@example.com")
        finally:
            db.close()

    def test_login_failure_returns_clear_error_and_rolls_back_state(self):
        self.seed_user()
        with auth_runtime(FALLBACK_SETTINGS):
            login = self.client.post(
                "/api/auth/login",
                json={"identifier": "fallback@example.com", "password": "WrongPass1"},
            )
        self.assertEqual(login.status_code, 401, login.text)
        self.assertIn("invalidos", login.json()["detail"].lower())


if __name__ == "__main__":
    unittest.main()
