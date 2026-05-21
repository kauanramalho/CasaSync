from app.database.base import Base
from app.database.session import engine
from app.services.username_service import unique_username_from_email
from sqlalchemy import inspect, text

# Importing models here registers them in SQLAlchemy metadata.
from app.models import category, couple, family, image_asset, integration, ranking, task, two_factor, user  # noqa: F401


def create_database_tables() -> None:
    Base.metadata.create_all(bind=engine)
    _upgrade_existing_tables()


def _table_columns(connection, table_name: str) -> set[str]:
    return {column["name"] for column in inspect(connection).get_columns(table_name)}


def _add_column_if_missing(connection, table_name: str, column_name: str, definition: str) -> None:
    if column_name not in _table_columns(connection, table_name):
        connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {definition}"))


def _timestamp_with_timezone_type() -> str:
    if engine.dialect.name == "postgresql":
        return "TIMESTAMP WITH TIME ZONE"
    return "DATETIME"


def _backfill_missing_usernames(connection) -> None:
    rows = connection.execute(text("SELECT id, email, username FROM users")).mappings().all()
    used_usernames = {
        row["username"].strip().lower()
        for row in rows
        if row["username"] and row["username"].strip()
    }
    for row in rows:
        if row["username"] and row["username"].strip():
            continue
        username = unique_username_from_email(row["email"], used_usernames)
        used_usernames.add(username)
        connection.execute(
            text("UPDATE users SET username = :username WHERE id = :user_id"),
            {"username": username, "user_id": row["id"]},
        )


def _upgrade_existing_tables() -> None:
    # create_all does not alter existing MVP databases. These additive upgrades keep
    # local/dev installs compatible without requiring Alembic for this project.
    with engine.begin() as connection:
        existing_tables = set(inspect(connection).get_table_names())
        if "users" in existing_tables:
            _add_column_if_missing(connection, "users", "username", "username VARCHAR(30)")
            _add_column_if_missing(connection, "users", "token_version", "token_version INTEGER DEFAULT 0 NOT NULL")
            _add_column_if_missing(connection, "users", "email_verified", "email_verified BOOLEAN DEFAULT TRUE NOT NULL")
            _add_column_if_missing(connection, "users", "email_verified_at", f"email_verified_at {_timestamp_with_timezone_type()}")
            _add_column_if_missing(connection, "users", "two_factor_enabled", "two_factor_enabled BOOLEAN DEFAULT TRUE NOT NULL")
            _add_column_if_missing(connection, "users", "last_login_at", f"last_login_at {_timestamp_with_timezone_type()}")
            _add_column_if_missing(connection, "users", "last_2fa_verified_at", f"last_2fa_verified_at {_timestamp_with_timezone_type()}")
            _backfill_missing_usernames(connection)
            connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username_unique ON users (username) WHERE username IS NOT NULL"))
            connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username_lower_unique ON users (LOWER(username)) WHERE username IS NOT NULL"))
            if engine.dialect.name == "postgresql":
                connection.execute(text("ALTER TABLE users ALTER COLUMN avatar_url TYPE TEXT"))

        if "families" in existing_tables:
            _add_column_if_missing(connection, "families", "description", "description TEXT")
            _add_column_if_missing(connection, "families", "image_url", "image_url TEXT")

        if "family_join_requests" in existing_tables:
            _add_column_if_missing(connection, "family_join_requests", "expires_at", f"expires_at {_timestamp_with_timezone_type()}")
            connection.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_family_join_requests_pending_unique "
                    "ON family_join_requests (family_id, requester_id) WHERE status = 'pending'"
                )
            )

        if "couple_goals" in existing_tables:
            _add_column_if_missing(connection, "couple_goals", "progress", "progress INTEGER DEFAULT 0 NOT NULL")
            _add_column_if_missing(connection, "couple_goals", "pinned", "pinned BOOLEAN DEFAULT FALSE NOT NULL")

        if "date_ideas" in existing_tables:
            _add_column_if_missing(connection, "date_ideas", "location", "location VARCHAR(180)")
            _add_column_if_missing(connection, "date_ideas", "budget", "budget VARCHAR(80)")
            _add_column_if_missing(connection, "date_ideas", "external_url", "external_url TEXT")
            _add_column_if_missing(connection, "date_ideas", "image_url", "image_url TEXT")
            _add_column_if_missing(connection, "date_ideas", "pinned", "pinned BOOLEAN DEFAULT FALSE NOT NULL")

        if "quick_notes" in existing_tables:
            _add_column_if_missing(connection, "quick_notes", "color", "color VARCHAR(40) DEFAULT 'rose' NOT NULL")
            _add_column_if_missing(connection, "quick_notes", "pinned", "pinned BOOLEAN DEFAULT FALSE NOT NULL")

        if "tasks" in existing_tables:
            _add_column_if_missing(connection, "tasks", "archived_at", f"archived_at {_timestamp_with_timezone_type()}")
            _add_column_if_missing(connection, "tasks", "score_recorded_at", f"score_recorded_at {_timestamp_with_timezone_type()}")
            _add_column_if_missing(connection, "tasks", "task_type", "task_type VARCHAR(24) DEFAULT 'tarefa' NOT NULL")
            _add_column_if_missing(connection, "tasks", "reminder_enabled", "reminder_enabled BOOLEAN DEFAULT FALSE NOT NULL")
            _add_column_if_missing(connection, "tasks", "reminder_value", "reminder_value INTEGER")
            _add_column_if_missing(connection, "tasks", "reminder_unit", "reminder_unit VARCHAR(16)")
            _add_column_if_missing(connection, "tasks", "reminder_at", f"reminder_at {_timestamp_with_timezone_type()}")
            _add_column_if_missing(connection, "tasks", "reminder_sent", "reminder_sent BOOLEAN DEFAULT FALSE NOT NULL")
            _add_column_if_missing(connection, "tasks", "google_calendar_event_id", "google_calendar_event_id VARCHAR(255)")
            _add_column_if_missing(connection, "tasks", "google_calendar_synced_at", f"google_calendar_synced_at {_timestamp_with_timezone_type()}")
            _add_column_if_missing(connection, "tasks", "google_calendar_synced_by_id", "google_calendar_synced_by_id VARCHAR(36)")
            _add_column_if_missing(connection, "tasks", "automation_source", "automation_source VARCHAR(80)")
            _add_column_if_missing(connection, "tasks", "automation_external_id", "automation_external_id VARCHAR(160)")
            _add_column_if_missing(connection, "tasks", "automation_source_label", "automation_source_label VARCHAR(180)")
            _add_column_if_missing(connection, "tasks", "automation_source_reference", "automation_source_reference TEXT")
            _add_column_if_missing(connection, "tasks", "recurrence_rule", "recurrence_rule VARCHAR(255)")
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_tasks_google_calendar_event_id ON tasks (google_calendar_event_id)"))
            connection.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_tasks_automation_external_unique "
                    "ON tasks (family_id, automation_source, automation_external_id) "
                    "WHERE automation_external_id IS NOT NULL"
                )
            )

        if "google_calendar_connections" in existing_tables:
            _add_column_if_missing(connection, "google_calendar_connections", "access_token_expires_at", f"access_token_expires_at {_timestamp_with_timezone_type()}")
            _add_column_if_missing(connection, "google_calendar_connections", "token_scope", "token_scope VARCHAR(1000)")
            _add_column_if_missing(connection, "google_calendar_connections", "token_type", "token_type VARCHAR(40)")
            _add_column_if_missing(connection, "google_calendar_connections", "disconnected_at", f"disconnected_at {_timestamp_with_timezone_type()}")
            if engine.dialect.name == "postgresql":
                connection.execute(text("ALTER TABLE google_calendar_connections DROP CONSTRAINT IF EXISTS google_calendar_connections_family_id_key"))
            connection.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_google_calendar_connections_family_user_unique "
                    "ON google_calendar_connections (family_id, user_id) "
                    "WHERE user_id IS NOT NULL"
                )
            )
