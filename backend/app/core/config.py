from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def default_cors_origins() -> list[str]:
    return [
        "https://casa-sync.vercel.app",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ]


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
    email_dev_mode: bool = True

    cors_origins: list[str] = Field(default_factory=default_cors_origins)
    cors_origin_regex: str | None = r"^https://casa-sync(?:-[a-z0-9-]+)*\.vercel\.app$"

    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str | None = None

    ai_provider: str = "mock"
    ai_api_key: str | None = None

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def allowed_cors_origins(self) -> list[str]:
        return sorted(set(default_cors_origins()) | set(self.cors_origins))


@lru_cache
def get_settings() -> Settings:
    return Settings()
