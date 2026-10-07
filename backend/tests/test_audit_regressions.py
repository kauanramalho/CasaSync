import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from sqlalchemy.exc import OperationalError
from starlette.requests import Request

from app.routes.auth import register
from app.schemas.user import UserCreate
from app.services.calendar_provider_adapter import CalendarProviderError, GoogleCalendarOAuthConfig, GoogleCalendarProviderAdapter


class AuditRegressionTest(unittest.TestCase):
    def test_auth_failure_logs_do_not_contain_sql_parameters_or_raw_exception(self):
        request = Request({"type": "http", "method": "POST", "path": "/api/auth/register", "headers": [],
                           "client": ("203.0.113.52", 1), "server": ("testserver", 80), "scheme": "http"})
        failure = OperationalError("INSERT INTO users VALUES (:private)", {"private": "sensitive-password"}, Exception("private-database-url"))
        with patch("app.routes.auth.check_rate_limit"), patch("app.routes.auth.register_user", side_effect=failure), \
                self.assertLogs("app.routes.auth", level="ERROR") as captured, self.assertRaises(HTTPException):
            register(UserCreate(name="Teste", username="audit-user", email="audit@example.com", password="Strong-test-123"), request, MagicMock())
        output = " ".join(captured.output)
        self.assertIn("OperationalError", output)
        self.assertNotIn("sensitive-password", output)
        self.assertNotIn("private-database-url", output)
        self.assertNotIn("INSERT INTO", output)

    def test_google_rejects_non_object_json_as_a_safe_provider_error(self):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = b"[]"
        config = GoogleCalendarOAuthConfig(client_id="test", client_secret="test", redirect_uri="https://api.example.test/callback")
        with patch("app.services.calendar_provider_adapter.urlopen", return_value=response), self.assertRaises(CalendarProviderError):
            GoogleCalendarProviderAdapter().refresh_access_token(config, "test-refresh")
