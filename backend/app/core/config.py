import json
from functools import lru_cache
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import Field, field_validator, model_validator
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
INSECURE_JWT_SECRETS = {
    "change-me-in-production",
    "troque-esta-chave-em-producao",
}


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


def _normalize_database_url(database_url: str) -> str:
    normalized = database_url.strip()
    if normalized.startswith("postgres://"):
        normalized = normalized.replace("postgres://", "postgresql+psycopg2://", 1)
    elif normalized.startswith("postgresql://"):
        normalized = normalized.replace("postgresql://", "postgresql+psycopg2://", 1)

    parsed = urlsplit(normalized)
    hostname = (parsed.hostname or "").lower()
    if hostname.endswith(".neon.tech"):
        query = dict(parse_qsl(parsed.query, keep_blank_values=True))
        query.setdefault("sslmode", "require")
        normalized = urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query), parsed.fragment))
    return normalized


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
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool = True
    email_from: str = "CasaSync <no-reply@casasync.app>"
    smtp_from: str | None = None
    email_delivery_http_url: str | None = None
    email_delivery_http_token: str | None = None
    email_delivery_http_timeout_seconds: float = 20.0
    email_dev_mode: bool = False
    email_notifications_enabled: bool = False

    frontend_url: str | None = None
    cors_origins: list[str] = Field(default_factory=list)
    cors_origin_regex: str | None = None

    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str | None = None
    google_calendar_enabled: bool = False
    google_calendar_default_timezone: str = "America/Sao_Paulo"
    google_calendar_default_event_minutes: int = 60
    google_calendar_request_timeout_seconds: float = 20.0
    integration_token_encryption_key: str | None = None

    ai_provider: str = "openai"
    ai_api_key: str | None = None
    ai_image_analysis_enabled: bool = True
    ai_vision_enabled: bool = False
    ai_vision_provider: str = "openai"
    openai_api_key: str | None = None
    openai_vision_model: str = "gpt-4.1-mini"
    openai_vision_timeout_seconds: float = 45.0
    openai_vision_max_output_tokens: int = 2200
    ai_image_job_retention_hours: int = 24

    task_attachment_storage_dir: Path = BACKEND_DIR / "storage" / "task_attachments"
    ai_image_job_storage_dir: Path = BACKEND_DIR / "storage" / "ai_image_jobs"

    web_push_enabled: bool = False
    vapid_public_key: str | None = None
    vapid_private_key: str | None = None
    vapid_subject: str | None = None

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

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        return _normalize_database_url(value)

    @field_validator(
        "frontend_url",
        "cors_origin_regex",
        "google_client_id",
        "google_client_secret",
        "google_redirect_uri",
        "integration_token_encryption_key",
        "two_factor_hmac_secret",
        "ai_api_key",
        "openai_api_key",
        "smtp_user",
        "smtp_from",
        "email_delivery_http_url",
        "email_delivery_http_token",
        "vapid_public_key",
        "vapid_private_key",
        "vapid_subject",
        mode="before",
    )
    @classmethod
    def blank_to_none(cls, value):
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("jwt_algorithm")
    @classmethod
    def validate_jwt_algorithm(cls, value: str) -> str:
        normalized = value.strip().upper()
        if normalized not in {"HS256", "HS384", "HS512"}:
            raise ValueError("JWT_ALGORITHM deve usar HS256, HS384 ou HS512.")
        return normalized

    @model_validator(mode="after")
    def validate_production_security(self):
        if not self.is_production:
            return self

        jwt_secret = self.jwt_secret_key.strip()
        if len(jwt_secret) < 32 or jwt_secret.lower() in INSECURE_JWT_SECRETS:
            raise ValueError("JWT_SECRET_KEY deve ter pelo menos 32 caracteres aleatorios em producao.")
        if self.email_dev_mode:
            raise ValueError("EMAIL_DEV_MODE deve permanecer desativado em producao.")
        http_delivery_values = (self.email_delivery_http_url, self.email_delivery_http_token)
        if any(http_delivery_values) and not all(http_delivery_values):
            raise ValueError("EMAIL_DELIVERY_HTTP_URL e EMAIL_DELIVERY_HTTP_TOKEN devem ser configurados juntos.")
        if self.email_delivery_http_url:
            delivery_url = urlsplit(self.email_delivery_http_url)
            if delivery_url.scheme != "https" or not delivery_url.netloc:
                raise ValueError("EMAIL_DELIVERY_HTTP_URL deve usar HTTPS em producao.")
            if len(self.email_delivery_http_token or "") < 32:
                raise ValueError("EMAIL_DELIVERY_HTTP_TOKEN deve ter pelo menos 32 caracteres em producao.")
        hmac_secret = (self.two_factor_hmac_secret or "").strip()
        if len(hmac_secret) < 32:
            raise ValueError("TWO_FACTOR_HMAC_SECRET deve ter pelo menos 32 caracteres em producao.")
        if hmac_secret == jwt_secret:
            raise ValueError("TWO_FACTOR_HMAC_SECRET deve ser diferente de JWT_SECRET_KEY em producao.")
        encryption_key = (self.integration_token_encryption_key or "").strip()
        if self.google_calendar_enabled and len(encryption_key) < 32:
            raise ValueError("INTEGRATION_TOKEN_ENCRYPTION_KEY deve ter pelo menos 32 caracteres quando Google Agenda esta ativo em producao.")
        if encryption_key and encryption_key in {jwt_secret, hmac_secret}:
            raise ValueError("INTEGRATION_TOKEN_ENCRYPTION_KEY deve usar um segredo separado em producao.")
        return self

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
    def email_delivery_http_configured(self) -> bool:
        return bool(self.email_delivery_http_url and self.email_delivery_http_token)

    @property
    def smtp_auth_username(self) -> str | None:
        return self.smtp_username or self.smtp_user

    @property
    def smtp_sender(self) -> str:
        return self.smtp_from or self.email_from

    @property
    def web_push_configured(self) -> bool:
        return bool(self.vapid_public_key and self.vapid_private_key and self.vapid_subject)

    @property
    def google_calendar_configured(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret and self.google_redirect_uri)

    @property
    def openai_vision_configured(self) -> bool:
        return bool(self.openai_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
