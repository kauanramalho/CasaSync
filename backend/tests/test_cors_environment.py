import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.main import app
from app.routes import families


class CorsEnvironmentTest(unittest.TestCase):
    def test_os_environment_accepts_single_csv_json_and_empty_values(self):
        origin = "https://casa-sync.vercel.app"
        extra = "https://casasync.onrender.com"
        for raw, expected in (
            (origin, [origin]),
            (f"  {origin}/, {extra}/  ", [origin, extra]),
            (f'["{origin}/", "{extra}"]', [origin, extra]),
            ("[]", []),
            ("", []),
        ):
            with self.subTest(raw=raw), patch.dict(os.environ, {"CORS_ORIGINS": raw}, clear=True):
                self.assertEqual(Settings(_env_file=None).cors_origins, expected)

    def test_dotenv_csv_uses_the_same_parser(self):
        with tempfile.TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            env_file.write_text("CORS_ORIGINS=https://casa-sync.vercel.app,https://casasync.onrender.com\n", encoding="utf-8")
            with patch.dict(os.environ, {}, clear=True):
                settings = Settings(_env_file=env_file)
            self.assertEqual(settings.cors_origins, ["https://casa-sync.vercel.app", "https://casasync.onrender.com"])

    def test_invalid_environment_origins_raise_clear_validation_errors(self):
        for raw in ("*", '["https://app.example.test",]', "not-an-origin", '[""]', "https://app.example.com,", "https://app.example.com,,https://other.example.com"):
            with self.subTest(raw=raw), patch.dict(os.environ, {"CORS_ORIGINS": raw}, clear=True):
                with self.assertRaises(ValidationError):
                    Settings(_env_file=None)

    def test_production_preflight_and_401_preserve_the_exact_authorized_origin(self):
        origin = "https://casa-sync.vercel.app"
        with patch.dict(os.environ, {}, clear=True):
            settings = Settings(
                _env_file=None,
                environment="production",
                frontend_url=origin,
                jwt_secret_key="test-only-jwt-secret-with-more-than-thirty-two-characters",
                two_factor_hmac_secret="test-only-hmac-secret-with-more-than-thirty-two-characters",
            )
        middleware = next(item for item in app.user_middleware if item.cls is CORSMiddleware)
        cors_app = FastAPI()
        cors_app.include_router(families.router, prefix="/api")
        cors_app.add_middleware(CORSMiddleware, **{
            **middleware.kwargs,
            "allow_origins": settings.allowed_cors_origins,
            "allow_origin_regex": settings.cors_origin_regex,
        })
        client = TestClient(cors_app)
        headers = {
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Authorization,Content-Type,X-CasaSync-Family-Id",
        }
        allowed = client.options("/api/families", headers=headers)
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(allowed.headers["access-control-allow-origin"], origin)
        self.assertNotIn("access-control-allow-credentials", allowed.headers)
        unauthorized = client.get("/api/families", headers={"Origin": origin})
        self.assertEqual(unauthorized.status_code, 401)
        self.assertEqual(unauthorized.headers["access-control-allow-origin"], origin)
        for blocked_origin in ("https://untrusted.example", "http://localhost:5173"):
            blocked = client.options("/api/families", headers={**headers, "Origin": blocked_origin})
            self.assertEqual(blocked.status_code, 400)
            self.assertNotIn("access-control-allow-origin", blocked.headers)
