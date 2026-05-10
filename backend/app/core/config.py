from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


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

    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
    )

    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str | None = None

    ai_provider: str = "mock"
    ai_api_key: str | None = None

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
