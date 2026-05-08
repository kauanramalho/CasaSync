from app.database.base import Base
from app.database.session import engine
from sqlalchemy import inspect, text

# Importing models here registers them in SQLAlchemy metadata.
from app.models import category, couple, family, integration, task, user  # noqa: F401


def create_database_tables() -> None:
    Base.metadata.create_all(bind=engine)
    _upgrade_existing_tables()


def _table_columns(connection, table_name: str) -> set[str]:
    return {column["name"] for column in inspect(connection).get_columns(table_name)}


def _add_column_if_missing(connection, table_name: str, column_name: str, definition: str) -> None:
    if column_name not in _table_columns(connection, table_name):
        connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {definition}"))


def _upgrade_existing_tables() -> None:
    # create_all does not alter existing MVP databases. These additive upgrades keep
    # local/dev installs compatible without requiring Alembic for this project.
    with engine.begin() as connection:
        existing_tables = set(inspect(connection).get_table_names())
        if "users" in existing_tables:
            _add_column_if_missing(connection, "users", "username", "username VARCHAR(80)")
            if engine.dialect.name == "postgresql":
                connection.execute(text("ALTER TABLE users ALTER COLUMN avatar_url TYPE TEXT"))

        if "families" in existing_tables:
            _add_column_if_missing(connection, "families", "description", "description TEXT")
            _add_column_if_missing(connection, "families", "image_url", "image_url TEXT")

        if "couple_goals" in existing_tables:
            _add_column_if_missing(connection, "couple_goals", "progress", "progress INTEGER DEFAULT 0 NOT NULL")

        if "date_ideas" in existing_tables:
            _add_column_if_missing(connection, "date_ideas", "location", "location VARCHAR(180)")
            _add_column_if_missing(connection, "date_ideas", "budget", "budget VARCHAR(80)")
            _add_column_if_missing(connection, "date_ideas", "external_url", "external_url TEXT")
            _add_column_if_missing(connection, "date_ideas", "image_url", "image_url TEXT")

        if "quick_notes" in existing_tables:
            _add_column_if_missing(connection, "quick_notes", "color", "color VARCHAR(40) DEFAULT 'rose' NOT NULL")
