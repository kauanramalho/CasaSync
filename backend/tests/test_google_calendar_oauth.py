import unittest
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.database.base import Base
from app.models import Family, FamilyMember, GoogleCalendarUserConnection, Task, User
from app.routes.integrations import google_calendar_callback
from app.services.calendar_provider_adapter import (
    CalendarProviderAuthError,
    CalendarTokenResult,
    GoogleCalendarOAuthConfig,
    GoogleCalendarProviderAdapter,
)
from app.services.calendar_service import (
    create_calendar_event_from_task,
    disconnect_google_calendar,
    get_google_auth_url,
    get_google_calendar_status,
    handle_google_callback,
    sync_task_to_calendar,
)
from app.services.secret_service import decrypt_secret, encrypt_secret


class FakeOAuthAdapter:
    def __init__(self, *, refresh_error=None):
        self.refresh_error = refresh_error
        self.revoked_tokens = []

    def exchange_code_for_tokens(self, config, code):
        return CalendarTokenResult(
            access_token="test-access-token",
            refresh_token="test-refresh-token",
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            token_scope="https://www.googleapis.com/auth/calendar",
            token_type="Bearer",
        )

    def refresh_access_token(self, config, refresh_token):
        if self.refresh_error:
            raise self.refresh_error
        return CalendarTokenResult(
            access_token="refreshed-test-access-token",
            refresh_token=None,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            token_scope="https://www.googleapis.com/auth/calendar",
            token_type="Bearer",
        )

    def revoke_token(self, *, token, timeout_seconds):
        self.revoked_tokens.append(token)


class GoogleCalendarOAuthTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)
        self.db = self.SessionLocal()
        self.user = User(
            id="user-oauth",
            name="Kauan",
            username="kauan-oauth",
            email="oauth@example.test",
            hashed_password="hash",
            is_active=True,
        )
        self.family = Family(id="family-oauth", name="Casa OAuth", invite_code="OAUTH1")
        self.db.add_all([self.user, self.family])
        self.db.flush()
        self.db.add(FamilyMember(id="member-oauth", family_id=self.family.id, user_id=self.user.id, role="owner"))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def settings(self, **overrides):
        values = {
            "google_calendar_enabled": True,
            "google_client_id": "test-client-id",
            "google_client_secret": "test-client-secret",
            "google_redirect_uri": "https://api.example.test/api/integrations/google-calendar/callback",
            "integration_token_encryption_key": "test-only-encryption-key",
            "frontend_url": "https://app.example.test",
        }
        values.update(overrides)
        return Settings(**values)

    def create_connection(self, settings, *, expired=False):
        connection = GoogleCalendarUserConnection(
            id="oauth-connection",
            user_id=self.user.id,
            is_connected=True,
            access_token_encrypted=encrypt_secret("stored-test-access-token", settings),
            refresh_token_encrypted=encrypt_secret("stored-test-refresh-token", settings),
            access_token_expires_at=datetime.now(timezone.utc) + (timedelta(minutes=-5) if expired else timedelta(hours=1)),
            connected_at=datetime.now(timezone.utc),
        )
        self.db.add(connection)
        self.db.commit()
        return connection

    def create_task(self, **overrides):
        task = Task(
            id="oauth-task",
            family_id=self.family.id,
            creator_id=self.user.id,
            assignee_id=self.user.id,
            title=overrides.pop("title", "Consulta"),
            due_date=overrides.pop("due_date", datetime(2026, 6, 21, 2, 30, tzinfo=timezone.utc)),
            **overrides,
        )
        self.db.add(task)
        self.db.commit()
        return task

    def test_authorization_url_uses_offline_consent_and_current_scopes(self):
        response = get_google_auth_url(current_user_id=self.user.id, family_id=self.family.id, settings=self.settings())
        query = parse_qs(urlparse(response.url).query)

        self.assertEqual(query["access_type"], ["offline"])
        self.assertEqual(query["prompt"], ["consent"])
        self.assertEqual(query["redirect_uri"], ["https://api.example.test/api/integrations/google-calendar/callback"])
        self.assertIn("https://www.googleapis.com/auth/calendar", query["scope"][0])
        self.assertIn("https://www.googleapis.com/auth/calendar.events", query["scope"][0])
        self.assertTrue(query["state"][0])

    def test_callback_saves_encrypted_tokens_and_status_is_connected(self):
        settings = self.settings()
        auth = get_google_auth_url(current_user_id=self.user.id, family_id=self.family.id, settings=settings)
        state = parse_qs(urlparse(auth.url).query)["state"][0]

        with patch("app.services.calendar_service.get_calendar_provider_adapter", return_value=FakeOAuthAdapter()):
            result = handle_google_callback(self.db, code="test-code", state=state, error=None, settings=settings)

        connection = self.db.query(GoogleCalendarUserConnection).filter_by(user_id=self.user.id).one()
        self.assertEqual(result.status, "connected")
        self.assertNotIn("test-access-token", connection.access_token_encrypted)
        self.assertEqual(decrypt_secret(connection.refresh_token_encrypted, settings), "test-refresh-token")
        status = get_google_calendar_status(self.db, self.family.id, self.user.id, settings)
        self.assertTrue(status.is_connected)
        self.assertTrue(status.can_sync)

    def test_callback_errors_redirect_back_to_settings_instead_of_leaving_json_error(self):
        response = google_calendar_callback(
            code="test-code",
            state="invalid-state",
            error=None,
            db=self.db,
            settings=self.settings(),
        )

        self.assertEqual(response.status_code, 302)
        location = response.headers["location"]
        self.assertTrue(location.startswith("https://app.example.test/configuracoes?"))
        self.assertEqual(parse_qs(urlparse(location).query)["googleCalendar"], ["error"])

    def test_denied_callback_is_a_safe_result(self):
        result = handle_google_callback(self.db, code=None, state=None, error="access_denied", settings=self.settings())
        self.assertEqual(result.status, "denied")
        self.assertNotIn("access_denied", result.message)

    def test_missing_oauth_configuration_never_reports_sync_ready(self):
        configured_settings = self.settings()
        self.create_connection(configured_settings)
        incomplete_settings = self.settings(google_client_secret=None)

        status = get_google_calendar_status(self.db, self.family.id, self.user.id, incomplete_settings)
        result = sync_task_to_calendar(
            self.db,
            family_id=self.family.id,
            user_id=self.user.id,
            task_id=self.create_task().id,
            settings=incomplete_settings,
        )

        self.assertTrue(status.is_connected)
        self.assertFalse(status.can_sync)
        self.assertEqual(result.status, "not_configured")

    def test_invalid_refresh_disconnects_locally_and_requests_reconnection(self):
        settings = self.settings()
        connection = self.create_connection(settings, expired=True)
        task = self.create_task()
        adapter = FakeOAuthAdapter(refresh_error=CalendarProviderAuthError("invalid grant"))

        with patch("app.services.calendar_service.get_calendar_provider_adapter", return_value=adapter):
            result = sync_task_to_calendar(
                self.db,
                family_id=self.family.id,
                user_id=self.user.id,
                task_id=task.id,
                settings=settings,
            )

        self.db.refresh(connection)
        self.assertEqual(result.status, "auth_required")
        self.assertFalse(connection.is_connected)
        self.assertIsNone(connection.access_token_encrypted)
        self.assertIsNone(connection.refresh_token_encrypted)
        self.assertFalse(get_google_calendar_status(self.db, self.family.id, self.user.id, settings).is_connected)

    def test_disconnect_revokes_token_but_preserves_internal_tasks(self):
        settings = self.settings()
        self.create_connection(settings)
        task = self.create_task()
        adapter = FakeOAuthAdapter()

        with patch("app.services.calendar_service.get_calendar_provider_adapter", return_value=adapter):
            result = disconnect_google_calendar(
                self.db,
                family_id=self.family.id,
                user_id=self.user.id,
                settings=settings,
            )

        self.assertTrue(result.disconnected)
        self.assertEqual(adapter.revoked_tokens, ["stored-test-refresh-token"])
        self.assertIsNotNone(self.db.get(Task, task.id))

    def test_event_payload_uses_configured_timezone_near_midnight(self):
        task = self.create_task()
        payload = create_calendar_event_from_task(task, self.settings(), family_name=self.family.name, sync_user_id=self.user.id)

        self.assertEqual(payload["start"]["dateTime"], "2026-06-20T23:30:00-03:00")
        self.assertEqual(payload["start"]["timeZone"], "America/Sao_Paulo")
        self.assertEqual(payload["extendedProperties"]["private"]["casasyncTaskId"], task.id)

    def test_token_endpoint_http_400_is_classified_as_auth_error(self):
        adapter = GoogleCalendarProviderAdapter()
        config = GoogleCalendarOAuthConfig(
            client_id="test-client-id",
            client_secret="test-client-secret",
            redirect_uri="https://api.example.test/callback",
        )
        error = HTTPError("https://oauth2.googleapis.com/token", 400, "Bad Request", None, None)
        self.addCleanup(error.close)

        with patch("app.services.calendar_provider_adapter.urlopen", side_effect=error):
            with self.assertRaises(CalendarProviderAuthError):
                adapter.refresh_access_token(config, "invalid-test-refresh-token")


if __name__ == "__main__":
    unittest.main()
