import tempfile
import unittest
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

import app.models  # noqa: F401
from app.database.base import Base
from app.models.user import User


BACKEND_DIR = Path(__file__).resolve().parents[1]
EXPECTED_TABLES = set(Base.metadata.tables) | {"alembic_version"}


def migration_config(database_url: str) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    return config


class MigrationTest(unittest.TestCase):
    def test_empty_database_upgrades_to_head_without_model_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            database_path = Path(directory) / "empty.db"
            database_url = f"sqlite:///{database_path.as_posix()}"
            config = migration_config(database_url)

            command.upgrade(config, "head")
            engine = create_engine(database_url)
            try:
                self.assertEqual(set(inspect(engine).get_table_names()), EXPECTED_TABLES)
                with engine.connect() as connection:
                    revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
                self.assertEqual(revision, "20260801_0001")
                command.check(config)
            finally:
                engine.dispose()

    def test_compatible_unversioned_database_is_adopted_without_data_loss(self):
        with tempfile.TemporaryDirectory() as directory:
            database_path = Path(directory) / "existing.db"
            database_url = f"sqlite:///{database_path.as_posix()}"
            engine = create_engine(database_url)
            Base.metadata.create_all(engine)
            with Session(engine) as db:
                db.add(
                    User(
                        name="Migration Sentinel",
                        username="migration.sentinel",
                        email="migration@example.com",
                        hashed_password="not-a-real-password-hash",
                        email_verified=True,
                    )
                )
                db.commit()

            command.upgrade(migration_config(database_url), "head")
            try:
                with Session(engine) as db:
                    self.assertEqual(db.query(User).filter(User.username == "migration.sentinel").count(), 1)
                with engine.connect() as connection:
                    revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
                self.assertEqual(revision, "20260801_0001")
            finally:
                engine.dispose()

    def test_partial_legacy_schema_is_repaired_and_adopted_without_data_loss(self):
        with tempfile.TemporaryDirectory() as directory:
            database_path = Path(directory) / "legacy.db"
            database_url = f"sqlite:///{database_path.as_posix()}"
            engine = create_engine(database_url)
            with engine.begin() as connection:
                connection.execute(
                    text(
                        "CREATE TABLE users ("
                        "id VARCHAR(36) PRIMARY KEY, "
                        "name VARCHAR(120) NOT NULL, "
                        "email VARCHAR(255) NOT NULL, "
                        "hashed_password VARCHAR(255) NOT NULL, "
                        "avatar_url TEXT, "
                        "is_active BOOLEAN NOT NULL DEFAULT 1, "
                        "created_at DATETIME NOT NULL, "
                        "updated_at DATETIME NOT NULL)"
                    )
                )
                connection.execute(
                    text(
                        "INSERT INTO users (id, name, email, hashed_password, is_active, created_at, updated_at) "
                        "VALUES ('legacy-user', 'Legacy', 'legacy@example.com', 'hash', 1, "
                        "'2026-01-01 00:00:00', '2026-01-01 00:00:00')"
                    )
                )
            engine.dispose()

            command.upgrade(migration_config(database_url), "head")

            engine = create_engine(database_url)
            try:
                with Session(engine) as db:
                    user = db.query(User).filter(User.email == "legacy@example.com").one()
                    self.assertEqual(user.id, "legacy-user")
                    self.assertTrue(user.email_verified)
                    self.assertTrue(user.is_active)
                with engine.connect() as connection:
                    revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
                    tables = set(inspect(engine).get_table_names())
                self.assertEqual(revision, "20260801_0001")
                self.assertTrue(EXPECTED_TABLES.issubset(tables | {"alembic_version"}))
            finally:
                engine.dispose()


if __name__ == "__main__":
    unittest.main()
