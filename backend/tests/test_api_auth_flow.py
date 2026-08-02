import unittest
from contextlib import contextmanager
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import rate_limit
from app.core.config import Settings
from app.core.security import hash_password
from app.database.base import Base
from app.database.session import get_db
from app.main import app
from app.models.task import Task
from app.models.user import User


TEST_SETTINGS = Settings(
    _env_file=None,
    database_url="sqlite://",
    jwt_secret_key="test-jwt-secret-with-more-than-thirty-two-characters",
    two_factor_hmac_secret="test-hmac-secret-with-more-than-thirty-two-characters",
    email_dev_mode=True,
)


@contextmanager
def auth_runtime(settings=TEST_SETTINGS):
    with (
        patch("app.routes.auth.get_settings", return_value=settings),
        patch("app.services.two_factor_service.get_settings", return_value=settings),
        patch("app.services.email_service.get_settings", return_value=settings),
        patch("app.core.security.get_settings", return_value=settings),
        patch("app.services.email_service.logger.warning"),
    ):
        yield


class ApiAuthFlowTest(unittest.TestCase):
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

    @staticmethod
    def registration_payload(*, username="qa.auth", email="qa.auth@example.com"):
        return {
            "name": "QA Auth",
            "username": username,
            "email": email,
            "password": "StrongPass123",  # gitleaks:allow - synthetic test credential
        }

    def register_and_verify(self):
        registration = self.client.post(
            "/api/auth/register",
            json=self.registration_payload(),
        )
        self.assertEqual(registration.status_code, 201, registration.text)
        pending = registration.json()
        self.assertTrue(pending["requires_two_factor"])
        self.assertEqual(pending["delivery_mode"], "development")

        verification = self.client.post(
            "/api/auth/2fa/verify",
            json={"pending_token": pending["pending_token"], "code": "000000"},
        )
        self.assertEqual(verification.status_code, 200, verification.text)
        return verification.json()

    def test_health_readiness_and_cors_contract(self):
        health = self.client.get("/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.json()["status"], "ok")

        with patch("app.main.SessionLocal", self.SessionLocal):
            readiness = self.client.get("/health/ready")
        self.assertEqual(readiness.status_code, 200)
        self.assertEqual(readiness.json()["database"], "ok")

        allowed = self.client.options(
            "/api/auth/register",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(allowed.headers["access-control-allow-origin"], "http://localhost:5173")

        blocked = self.client.options(
            "/api/auth/register",
            headers={
                "Origin": "https://untrusted.example",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        self.assertEqual(blocked.status_code, 400)
        self.assertNotIn("access-control-allow-origin", blocked.headers)

    def test_readiness_returns_503_without_internal_database_details(self):
        class BrokenSession:
            def execute(self, _statement):
                raise OperationalError("SELECT 1", {}, Exception("private connection failure"))

            def close(self):
                return None

        with patch("app.main.SessionLocal", return_value=BrokenSession()):
            response = self.client.get("/health/ready")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"], "Banco de dados indisponivel.")
        self.assertNotIn("private connection", response.text)

    def test_registration_2fa_login_session_and_task_persistence(self):
        with auth_runtime():
            authenticated = self.register_and_verify()
            token = authenticated["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            current_user = self.client.get("/api/auth/me", headers=headers)
            self.assertEqual(current_user.status_code, 200)
            self.assertEqual(current_user.json()["username"], "qa.auth")

            family = self.client.post("/api/families", headers=headers, json={"name": "Familia QA"})
            self.assertEqual(family.status_code, 201, family.text)

            task = self.client.post(
                "/api/tasks",
                headers=headers,
                json={"title": "Validar persistencia", "priority": "media", "status": "pendente"},
            )
            self.assertEqual(task.status_code, 201, task.text)
            task_id = task.json()["id"]

            listed = self.client.get("/api/tasks", headers=headers)
            self.assertEqual(listed.status_code, 200)
            self.assertIn(task_id, {row["id"] for row in listed.json()})

            login = self.client.post(
                "/api/auth/login",
                json={"identifier": "qa.auth@example.com", "password": "StrongPass123"},  # gitleaks:allow - synthetic test credential
            )
            self.assertEqual(login.status_code, 200, login.text)
            self.assertIn("access_token", login.json())

            invalid_login = self.client.post(
                "/api/auth/login",
                json={"identifier": "qa.auth@example.com", "password": "WrongPass123"},
            )
            self.assertEqual(invalid_login.status_code, 401)

        verification_session = self.SessionLocal()
        try:
            self.assertEqual(verification_session.query(User).filter(User.username == "qa.auth").count(), 1)
            self.assertEqual(verification_session.query(Task).filter(Task.id == task_id).count(), 1)
        finally:
            verification_session.close()

    def test_duplicate_email_username_and_invalid_payload_statuses(self):
        with auth_runtime():
            first = self.client.post("/api/auth/register", json=self.registration_payload())
            self.assertEqual(first.status_code, 201)

            duplicate_email = self.client.post(
                "/api/auth/register",
                json=self.registration_payload(username="qa.other"),
            )
            self.assertEqual(duplicate_email.status_code, 409)

            duplicate_username = self.client.post(
                "/api/auth/register",
                json=self.registration_payload(email="qa.other@example.com"),
            )
            self.assertEqual(duplicate_username.status_code, 409)

            invalid = self.client.post(
                "/api/auth/register",
                json={"name": "Q", "username": "?", "email": "invalid", "password": "short"},
            )
            self.assertEqual(invalid.status_code, 422)

    def test_smtp_failure_returns_503_and_rolls_back_registration(self):
        smtp_settings = TEST_SETTINGS.model_copy(
            update={"email_dev_mode": False, "smtp_host": "smtp.invalid"}
        )
        with (
            auth_runtime(smtp_settings),
            patch("app.services.email_service.smtplib.SMTP", side_effect=OSError("smtp offline")),
        ):
            response = self.client.post("/api/auth/register", json=self.registration_payload())

        self.assertEqual(response.status_code, 503)
        self.assertNotIn("ja esta em uso", response.text)
        db = self.SessionLocal()
        try:
            self.assertEqual(db.query(User).count(), 0)
        finally:
            db.close()

    def test_unverified_registration_can_resume_without_duplicate_user(self):
        db = self.SessionLocal()
        try:
            db.add(
                User(
                    name="Cadastro Interrompido",
                    username="qa.auth",
                    email="qa.auth@example.com",
                    hashed_password=hash_password("StrongPass123"),
                    email_verified=False,
                )
            )
            db.commit()
        finally:
            db.close()

        with auth_runtime():
            registration = self.client.post(
                "/api/auth/register",
                json=self.registration_payload(),
            )
            self.assertEqual(registration.status_code, 201, registration.text)
            pending = registration.json()
            self.assertTrue(pending["requires_two_factor"])

            verification = self.client.post(
                "/api/auth/2fa/verify",
                json={"pending_token": pending["pending_token"], "code": "000000"},
            )
            self.assertEqual(verification.status_code, 200, verification.text)

        db = self.SessionLocal()
        try:
            users = db.query(User).filter(User.email == "qa.auth@example.com").all()
            self.assertEqual(len(users), 1)
            self.assertTrue(users[0].email_verified)
        finally:
            db.close()

    def test_smtp_failure_keeps_legacy_unverified_registration_recoverable(self):
        db = self.SessionLocal()
        try:
            db.add(
                User(
                    name="Cadastro Interrompido",
                    username="qa.auth",
                    email="qa.auth@example.com",
                    hashed_password=hash_password("StrongPass123"),
                    email_verified=False,
                )
            )
            db.commit()
        finally:
            db.close()

        smtp_settings = TEST_SETTINGS.model_copy(
            update={"email_dev_mode": False, "smtp_host": "smtp.invalid"}
        )
        with (
            auth_runtime(smtp_settings),
            patch("app.services.email_service.smtplib.SMTP", side_effect=OSError("smtp offline")),
        ):
            failed = self.client.post("/api/auth/register", json=self.registration_payload())
        self.assertEqual(failed.status_code, 503)

        with auth_runtime():
            retried = self.client.post("/api/auth/register", json=self.registration_payload())
        self.assertEqual(retried.status_code, 201, retried.text)

        db = self.SessionLocal()
        try:
            self.assertEqual(db.query(User).filter(User.email == "qa.auth@example.com").count(), 1)
            self.assertEqual(db.query(User).filter(User.email == "qa.auth@example.com").one().name, "QA Auth")
        finally:
            db.close()

    def test_database_failure_is_500_not_false_duplicate(self):
        with (
            auth_runtime(),
            patch(
                "app.routes.auth.register_user",
                side_effect=OperationalError("INSERT", {}, Exception("database unavailable")),
            ),
        ):
            response = self.client.post("/api/auth/register", json=self.registration_payload())

        self.assertEqual(response.status_code, 500)
        self.assertNotIn("ja esta em uso", response.text)


if __name__ == "__main__":
    unittest.main()
