from alembic import command
from alembic.config import Config

from app.core.config import BACKEND_DIR, get_settings


def alembic_config() -> Config:
    settings = get_settings()
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))
    return config


def run_database_migrations() -> None:
    command.upgrade(alembic_config(), "head")
