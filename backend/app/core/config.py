import json
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent

PRODUCTION_CORS_ORIGINS = ["https://casa-sync.vercel.app"]
DEVELOPMENT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]
LOCAL_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "::1"}


def _normalize_origin(origin: str) -> str:
    cleaned = origin.strip().rstrip("/")
    if not cleaned:
        return ""

    parsed = urlsplit(cleaned)
    if not parsed.scheme or not parsed.netloc:
        return cleaned

    hostname = (parsed.hostname or "").lower()
    if ":" in hostname and not hostname.startswith("["):
        hostname = f"[{hostname}]"

    netloc = hostname
    if parsed.port:
        netloc = f"{netloc}:{parsed.port}"

    return urlunsplit((parsed.scheme.lower(), netloc, "", "", ""))


def _is_local_origin(origin: str) -> bool:
    parsed = urlsplit(origin)
    return (parsed.hostname or "").lower() in LOCAL_HOSTS


class Settings(BaseSettings):
    app_name: str = "CasaSync"
    api_v1_prefix: str = "/api"
    environment: str = "development"

    database_url: str = "postgresql+psycopg2://casasync:casasync@localhost:5432/casasync"

    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7

    two_factor_code_ttl_minutes: int = 10
    two_factor_pending_token_expire_minutes: int = 15
    two_factor_max_attempts: int = 5
    two_factor_resend_cooldown_seconds: int = 60
    two_factor_max_sends_per_hour: int = 5
    two_factor_login_interval_days: int = 30
    two_factor_code_length: int = 6
    two_factor_hmac_secret: str | None = None

    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool = True
    email_from: str = "CasaSync <no-reply@casasync.app>"
    email_dev_mode: bool = False

    frontend_url: str | None = None
    cors_origins: list[str] = Field(default_factory=list)
    cors_origin_regex: str | None = r"^https://casa-sync(?:-[a-z0-9-]+)*\.vercel\.app$"

    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str | None = None
    google_calendar_enabled: bool = False
    google_calendar_default_timezone: str = "America/Sao_Paulo"
    google_calendar_default_event_minutes: int = 60

    ai_provider: str = "mock"
    ai_api_key: str | None = None
    ai_image_analysis_enabled: bool = True
    ai_vision_provider: str = "mock"

    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value):
        if value is None or value == "":
            return []
        if isinstance(value, str):
            cleaned = value.strip()
            if not cleaned:
                return []
            if cleaned.startswith("["):
                try:
                    return json.loads(cleaned)
                except json.JSONDecodeError:
                    pass
            return [origin.strip() for origin in cleaned.split(",") if origin.strip()]
        return value

    @field_validator(
        "frontend_url",
        "cors_origin_regex",
        "google_client_id",
        "google_client_secret",
        "google_redirect_uri",
        mode="before",
    )
    @classmethod
    def blank_to_none(cls, value):
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() == "production"

    @property
    def allowed_cors_origins(self) -> list[str]:
        origins = []
        if self.frontend_url:
            origins.append(self.frontend_url)
        origins.extend(self.cors_origins)
        origins.extend(PRODUCTION_CORS_ORIGINS)
        if not self.is_production:
            origins.extend(DEVELOPMENT_CORS_ORIGINS)

        normalized_origins = {
            normalized
            for origin in origins
            if (normalized := _normalize_origin(origin))
            and (not self.is_production or not _is_local_origin(normalized))
        }
        return sorted(normalized_origins)

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_host)

    @property
    def google_calendar_configured(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret and self.google_redirect_uri)


@lru_cache
def get_settings() -> Settings:
    return Settings()
