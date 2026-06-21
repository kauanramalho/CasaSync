import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from starlette.requests import Request

from app.core import rate_limit
from app.core.config import Settings
from app.core.deps import get_current_user, oauth2_scheme
from app.core.security import create_access_token, create_pending_two_factor_token, hash_password
from app.database.base import Base
from app.models.two_factor import TwoFactorCode
from app.models.user import User
from app.routes.auth import login, register, verify_two_factor
from app.schemas.token import AuthResponse, TwoFactorRequiredResponse, TwoFactorVerifyRequest
from app.schemas.user import PasswordUpdate, UserCreate, UserLogin, UserRead, UserUpdate
from app.services import auth_service
from app.services.auth_service import authenticate_user, delete_user_account, register_user, update_user_profile
from app.services.email_service import send_two_factor_email
from app.services.two_factor_service import (
    create_two_factor_challenge,
    load_pending_two_factor_context,
    verify_two_factor_code,
)


TEST_SETTINGS = Settings(
    _env_file=None,
    jwt_secret_key="test-jwt-secret-with-more-than-thirty-two-characters",
    two_factor_hmac_secret="test-hmac-secret-with-more-than-thirty-two-characters",
)


def make_request(*, client_host="203.0.113.10", forwarded_for=None):
    headers = []
    if forwarded_for:
        headers.append((b"x-forwarded-for", forwarded_for.encode("ascii")))
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/auth/login",
            "headers": headers,
            "client": (client_host, 12345),
            "server": ("testserver", 80),
            "scheme": "http",
        }
    )


class ProductionSettingsSecurityTest(unittest.TestCase):
    def production_settings(self, **overrides):
        values = {
            "_env_file": None,
            "environment": "production",
            "jwt_secret_key": "jwt-secret-with-more-than-thirty-two-random-characters",
            "two_factor_hmac_secret": "hmac-secret-with-more-than-thirty-two-random-characters",
            "email_dev_mode": False,
        }
        values.update(overrides)
        return Settings(**values)

    def test_production_rejects_default_or_short_jwt_secret(self):
        for secret in ("change-me-in-production", "short"):
            with self.subTest(secret=secret), self.assertRaises(ValidationError):
                self.production_settings(jwt_secret_key=secret)

    def test_production_rejects_dev_email_mode_and_missing_hmac_secret(self):
        with self.assertRaises(ValidationError):
            self.production_settings(email_dev_mode=True)
        with self.assertRaises(ValidationError):
            self.production_settings(two_factor_hmac_secret=None)

    def test_production_rejects_shared_hmac_secret(self):
        shared = "shared-secret-with-more-than-thirty-two-random-characters"
        with self.assertRaises(ValidationError):
            self.production_settings(jwt_secret_key=shared, two_factor_hmac_secret=shared)

    def test_unsafe_jwt_algorithm_is_rejected_in_every_environment(self):
        with self.assertRaises(ValidationError):
            Settings(_env_file=None, jwt_algorithm="none")

    def test_production_requires_calendar_encryption_key_when_enabled(self):
        with self.assertRaises(ValidationError):
            self.production_settings(google_calendar_enabled=True, integration_token_encryption_key=None)

    def test_secure_production_settings_are_accepted(self):
        settings = self.production_settings(
            google_calendar_enabled=True,
            integration_token_encryption_key="calendar-encryption-key-with-more-than-thirty-two-characters",
        )
        self.assertTrue(settings.is_production)


class AuthSecurityTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)
        self.db = self.SessionLocal()
        self.user = User(
            id="auth-user",
            name="Usuario Seguro",
            username="usuario.seguro",
            email="user@example.com",
            hashed_password=hash_password("CurrentPass123"),
            email_verified=True,
            is_active=True,
        )
        self.db.add(self.user)
        self.db.commit()
        rate_limit._BUCKETS.clear()

    def tearDown(self):
        rate_limit._BUCKETS.clear()
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_password_rules_and_auth_payloads_reject_unsafe_input(self):
        with self.assertRaises(ValidationError):
            UserCreate(name="Teste", username="teste", email="teste@example.com", password="12345678")
        with self.assertRaises(ValidationError):
            PasswordUpdate(current_password="CurrentPass123", new_password="onlyletters")
        with self.assertRaises(ValidationError):
            UserUpdate(name="Teste", token_version=99)

    def test_valid_and_invalid_login_share_generic_error(self):
        authenticated = authenticate_user(self.db, self.user.email, "CurrentPass123")
        self.assertEqual(authenticated.id, self.user.id)

        errors = []
        for identifier in (self.user.email, "missing@example.com"):
            with self.assertRaises(HTTPException) as raised:
                authenticate_user(self.db, identifier, "WrongPass123")
            errors.append((raised.exception.status_code, raised.exception.detail))
        self.assertEqual(errors[0], errors[1])

    def test_registration_hashes_password_and_rejects_duplicate_email(self):
        payload = UserCreate(
            name="Nova Conta",
            username="nova.segura",
            email="secure@example.com",
            password="StrongPass123",
        )
        created = register_user(self.db, payload)
        self.assertNotEqual(created.hashed_password, payload.password)
        self.assertNotIn(payload.password, created.hashed_password)
        with self.assertRaises(HTTPException) as raised:
            register_user(self.db, payload)
        self.assertEqual(raised.exception.status_code, 409)

    def test_missing_user_executes_dummy_password_verification(self):
        original_verify = auth_service.verify_password
        calls = []

        def recording_verify(password, password_hash):
            calls.append(password_hash)
            return original_verify(password, password_hash)

        with patch("app.services.auth_service.verify_password", side_effect=recording_verify):
            with self.assertRaises(HTTPException):
                authenticate_user(self.db, "missing@example.com", "WrongPass123")
        self.assertIn(auth_service.DUMMY_PASSWORD_HASH, calls)

    def test_email_change_requires_current_password_and_invalidates_sessions(self):
        with self.assertRaises(HTTPException):
            update_user_profile(self.db, self.user, UserUpdate(email="next@example.com"))
        self.assertEqual(self.user.email, "user@example.com")

        previous_version = self.user.token_version
        updated = update_user_profile(
            self.db,
            self.user,
            UserUpdate(email="next@example.com", current_password="CurrentPass123"),
        )
        self.assertEqual(updated.email, "next@example.com")
        self.assertFalse(updated.email_verified)
        self.assertEqual(updated.token_version, previous_version + 1)

    def test_account_deletion_requires_current_password(self):
        with self.assertRaises(HTTPException):
            delete_user_account(self.db, self.user, "WrongPass123")
        self.assertTrue(self.user.is_active)

        delete_user_account(self.db, self.user, "CurrentPass123")
        self.assertFalse(self.user.is_active)
        self.assertTrue(self.user.email.endswith("@casasync.invalid"))

    def test_user_response_never_exposes_password_or_token_version(self):
        payload = UserRead.model_validate(self.user).model_dump()
        self.assertNotIn("hashed_password", payload)
        self.assertNotIn("token_version", payload)

    def test_invalid_expired_and_partial_tokens_are_rejected(self):
        with patch("app.core.security.get_settings", return_value=TEST_SETTINGS):
            expired = create_access_token(self.user.id, expires_delta=timedelta(seconds=-1))
            partial = create_pending_two_factor_token(self.user.id, "challenge", "login")

        for token in ("not-a-token", expired, partial):
            with patch("app.core.security.get_settings", return_value=TEST_SETTINGS):
                with self.assertRaises(HTTPException) as raised:
                    get_current_user(token=token, db=self.db)
            self.assertEqual(raised.exception.status_code, 401)

    def test_consumed_two_factor_challenge_cannot_be_reused_for_resend(self):
        challenge = TwoFactorCode(
            id="consumed-challenge",
            user_id=self.user.id,
            purpose="login",
            code_hash="hash",
            salt="salt",
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
            consumed_at=datetime.now(timezone.utc),
        )
        self.db.add(challenge)
        self.db.commit()
        with patch("app.core.security.get_settings", return_value=TEST_SETTINGS):
            token = create_pending_two_factor_token(self.user.id, challenge.id, "login")
            with self.assertRaises(HTTPException):
                load_pending_two_factor_context(self.db, token, require_active_challenge=True)

    def test_rate_limit_ignores_untrusted_forwarded_header(self):
        request = make_request(client_host="203.0.113.10", forwarded_for="198.51.100.99")
        self.assertEqual(rate_limit.client_identifier(request), "203.0.113.10")

    def test_rate_limit_fails_closed_when_bucket_capacity_is_exhausted(self):
        with patch.object(rate_limit, "_MAX_BUCKETS", 1):
            rate_limit.check_rate_limit("first", limit=5, window_seconds=300)
            with self.assertRaises(HTTPException) as raised:
                rate_limit.check_rate_limit("second", limit=5, window_seconds=300)
        self.assertEqual(raised.exception.status_code, 429)

    def test_login_account_limit_is_independent_from_client_ip(self):
        self.user.last_2fa_verified_at = datetime.now(timezone.utc)
        payload = UserLogin(identifier=self.user.email, password="CurrentPass123")
        with (
            patch("app.routes.auth.check_rate_limit") as limiter,
            patch("app.routes.auth.authenticate_user", return_value=self.user),
            patch("app.routes.auth.should_require_login_two_factor", return_value=False),
            patch("app.routes.auth.record_login_without_two_factor", return_value=self.user),
            patch("app.routes.auth.get_active_family", return_value=None),
            patch("app.routes.auth.create_access_token", return_value="access-token"),
        ):
            login(payload, make_request(client_host="203.0.113.10"), self.db)

        account_key = limiter.call_args_list[1].args[0]
        self.assertTrue(account_key.startswith("auth:login:account:"))
        self.assertNotIn("203.0.113.10", account_key)

    def test_failed_two_factor_delivery_rolls_back_new_registration(self):
        payload = UserCreate(
            name="Nova Conta",
            username="nova.conta",
            email="new@example.com",
            password="StrongPass123",
        )
        delivery_error = HTTPException(status_code=503, detail="delivery unavailable")
        with (
            patch("app.routes.auth.check_rate_limit"),
            patch("app.services.two_factor_service.send_two_factor_email", side_effect=delivery_error),
            patch("app.routes.auth.logger.warning"),
        ):
            with self.assertRaises(HTTPException):
                register(payload, make_request(), self.db)
        self.assertIsNone(self.db.query(User).filter(User.email == payload.email).first())
        self.assertEqual(self.db.query(TwoFactorCode).count(), 0)

    def test_dev_email_mode_simulates_delivery_without_logging_code_or_recipient(self):
        settings = Settings(_env_file=None, email_dev_mode=True)
        with (
            patch("app.services.email_service.get_settings", return_value=settings),
            patch("app.services.email_service.logger.warning") as warning,
        ):
            send_two_factor_email("private@example.com", "654321", "login", 10)
        rendered_log = " ".join(str(item) for call in warning.call_args_list for item in call.args)
        self.assertNotIn("654321", rendered_log)
        self.assertNotIn("private@example.com", rendered_log)

    def test_dev_email_mode_uses_local_fixed_code_without_smtp(self):
        settings = Settings(_env_file=None, email_dev_mode=True)
        with (
            patch("app.services.two_factor_service.get_settings", return_value=settings),
            patch("app.services.email_service.get_settings", return_value=settings),
            patch("app.services.email_service.logger.warning"),
        ):
            challenge = create_two_factor_challenge(self.db, self.user, "login")
            token = create_pending_two_factor_token(self.user.id, challenge.id, "login")
            context = load_pending_two_factor_context(self.db, token, require_active_challenge=True)
            verified = verify_two_factor_code(self.db, context, "000000")
        self.assertEqual(verified.id, self.user.id)

    def test_dev_login_route_returns_2fa_contract_and_fixed_code_authenticates(self):
        settings = TEST_SETTINGS.model_copy(update={"email_dev_mode": True})
        payload = UserLogin(identifier=self.user.email, password="CurrentPass123")
        with (
            patch("app.routes.auth.check_rate_limit"),
            patch("app.routes.auth.get_settings", return_value=settings),
            patch("app.services.two_factor_service.get_settings", return_value=settings),
            patch("app.services.email_service.get_settings", return_value=settings),
            patch("app.core.security.get_settings", return_value=settings),
            patch("app.services.email_service.logger.warning"),
        ):
            pending = login(payload, make_request(), self.db)
            self.assertIsInstance(pending, TwoFactorRequiredResponse)
            self.assertTrue(pending.requires_two_factor)
            self.assertTrue(pending.pending_token)
            self.assertEqual(pending.delivery_mode, "development")

            authenticated = verify_two_factor(
                TwoFactorVerifyRequest(pending_token=pending.pending_token, code="000000"),
                make_request(),
                self.db,
            )

        self.assertIsInstance(authenticated, AuthResponse)
        self.assertTrue(authenticated.access_token)
        self.assertEqual(authenticated.user.id, self.user.id)

    def test_wrong_expired_and_resend_cooldown_keep_clear_2fa_errors(self):
        settings = TEST_SETTINGS.model_copy(update={"email_dev_mode": True})
        with (
            patch("app.services.two_factor_service.get_settings", return_value=settings),
            patch("app.services.email_service.get_settings", return_value=settings),
            patch("app.services.email_service.logger.warning"),
        ):
            challenge = create_two_factor_challenge(self.db, self.user, "login")
            token = create_pending_two_factor_token(self.user.id, challenge.id, "login")
            context = load_pending_two_factor_context(self.db, token, require_active_challenge=True)

            with self.assertRaises(HTTPException) as wrong:
                verify_two_factor_code(self.db, context, "111111")
            self.assertEqual(wrong.exception.detail, "Codigo invalido.")

            with self.assertRaises(HTTPException) as cooldown:
                create_two_factor_challenge(self.db, self.user, "login")
            self.assertEqual(cooldown.exception.status_code, 429)

            challenge.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            self.db.add(challenge)
            self.db.commit()
            with self.assertRaises(HTTPException) as expired:
                verify_two_factor_code(self.db, context, "000000")
            self.assertIn("expirado", expired.exception.detail.lower())


class MissingTokenSecurityTest(unittest.IsolatedAsyncioTestCase):
    async def test_missing_bearer_token_is_rejected(self):
        with self.assertRaises(HTTPException) as raised:
            await oauth2_scheme(make_request())
        self.assertEqual(raised.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()
