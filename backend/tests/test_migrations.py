import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker

import app.models  # noqa: F401
from app.core import rate_limit
from app.core.config import Settings
from app.core.security import create_access_token
from app.database.base import Base
from app.database.session import get_db
from app.main import app
from app.models.family import Family, FamilyMember
from app.models.user import User
from app.schemas.family import FamilyCreate
from app.services.family_service import create_family, decide_join_request, request_join_family


BACKEND_DIR = Path(__file__).resolve().parents[1]
EXPECTED_TABLES = set(Base.metadata.tables) | {"alembic_version"}
EXPECTED_HEAD = "20261007_0002"


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
                self.assertEqual(revision, EXPECTED_HEAD)
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
                self.assertEqual(revision, EXPECTED_HEAD)
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
                self.assertEqual(revision, EXPECTED_HEAD)
                self.assertTrue(EXPECTED_TABLES.issubset(tables | {"alembic_version"}))
            finally:
                engine.dispose()

    @staticmethod
    def seed_versioned_family_database(engine, config):
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            db.add_all([
                User(id="migration-owner", name="Migration Owner", email="owner@example.com",
                     hashed_password="synthetic-hash", email_verified=True),
                User(id="migration-requester", name="Migration Requester", email="requester@example.com",
                     hashed_password="synthetic-hash", email_verified=True),
            ])
            db.flush()
            db.add(Family(id="migration-family", name="Existing Family", invite_code="QATEST01",
                          created_by_id="migration-owner"))
            db.flush()
            db.add(FamilyMember(id="migration-membership", family_id="migration-family",
                                user_id="migration-owner", role="owner", points=19,
                                ai_aliases=["responsavel"]))
            db.commit()
        command.stamp(config, "20260801_0001")

    def test_versioned_missing_alias_column_breaks_family_flows_then_upgrade_repairs_without_data_loss(self):
        with tempfile.TemporaryDirectory() as directory:
            database_url = f"sqlite:///{(Path(directory) / 'missing-alias.db').as_posix()}"
            config = migration_config(database_url)
            engine = create_engine(database_url)
            try:
                self.seed_versioned_family_database(engine, config)
                with engine.begin() as connection:
                    connection.execute(text("ALTER TABLE family_members DROP COLUMN ai_aliases"))

                with Session(engine) as db:
                    with self.assertRaises(OperationalError):
                        db.query(FamilyMember).first()
                    db.rollback()
                    # The write can succeed before the UI refresh reads the
                    # missing column; retrying the POST would duplicate families.
                    created_before_repair = create_family(
                        db, FamilyCreate(name="Before Repair"), "migration-owner"
                    )
                    self.assertIsNotNone(created_before_repair.id)
                    with self.assertRaises(OperationalError):
                        request_join_family(db, "QATEST01", "migration-requester")
                    db.rollback()
                    self.assertEqual(db.query(Family).count(), 2)

                command.upgrade(config, "head")
                command.upgrade(config, "head")
                with engine.connect() as connection:
                    revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
                self.assertEqual(revision, EXPECTED_HEAD)
                actual_columns = {column["name"] for column in inspect(engine).get_columns("family_members")}
                self.assertIn("ai_aliases", actual_columns)

                with Session(engine) as db:
                    member = db.get(FamilyMember, "migration-membership")
                    self.assertEqual((member.family_id, member.user_id, member.role, member.points),
                                     ("migration-family", "migration-owner", "owner", 19))
                    self.assertIsNone(member.ai_aliases)
                    self.assertEqual(member.aliases, [])
                    self.assertEqual(db.query(User).count(), 2)
                    family = create_family(db, FamilyCreate(name="After Repair"), "migration-owner")
                    self.assertEqual(db.get(User, "migration-owner").active_family_id, family.id)
                    request = request_join_family(db, "QATEST01", "migration-requester")
                    self.assertEqual(request.status, "pending")
                    approved = decide_join_request(db, "migration-family", "migration-owner", request.id, True)
                    self.assertEqual(approved.status, "approved")
                    self.assertEqual(db.query(FamilyMember).filter_by(family_id="migration-family").count(), 2)
                    self.assertEqual(db.query(Family).count(), 3)
                command.check(config)
            finally:
                engine.dispose()

    def test_existing_aliases_survive_upgrade_and_non_destructive_downgrade(self):
        with tempfile.TemporaryDirectory() as directory:
            database_url = f"sqlite:///{(Path(directory) / 'existing-alias.db').as_posix()}"
            config = migration_config(database_url)
            engine = create_engine(database_url)
            try:
                self.seed_versioned_family_database(engine, config)
                command.upgrade(config, "head")
                command.downgrade(config, "20260801_0001")
                command.upgrade(config, "head")
                with Session(engine) as db:
                    member = db.get(FamilyMember, "migration-membership")
                    self.assertEqual(member.ai_aliases, ["responsavel"])
                    self.assertEqual(member.points, 19)
                command.check(config)
            finally:
                engine.dispose()

    def test_postgresql_delta_sql_is_additive_and_idempotent(self):
        config = migration_config("postgresql+psycopg2://sql-output.invalid/casasync")
        output = io.StringIO()
        config.output_buffer = output
        command.upgrade(config, f"20260801_0001:{EXPECTED_HEAD}", sql=True)
        sql = output.getvalue()
        self.assertIn("ADD COLUMN IF NOT EXISTS ai_aliases JSON", sql)
        self.assertIn(EXPECTED_HEAD, sql)
        self.assertNotIn("DROP COLUMN", sql)
        self.assertNotIn("DROP TABLE", sql)

    def test_authenticated_family_api_recovers_after_upgrading_versioned_database(self):
        with tempfile.TemporaryDirectory() as directory:
            database_url = f"sqlite:///{(Path(directory) / 'family-api.db').as_posix()}"
            config = migration_config(database_url)
            engine = create_engine(database_url, connect_args={"check_same_thread": False})
            session_factory = sessionmaker(bind=engine)
            settings = Settings(_env_file=None, database_url=database_url,
                                jwt_secret_key="synthetic-migration-jwt-secret-longer-than-32-characters")

            def override_get_db():
                with session_factory() as db:
                    yield db

            previous_overrides = dict(app.dependency_overrides)
            try:
                self.seed_versioned_family_database(engine, config)
                with engine.begin() as connection:
                    connection.execute(text("ALTER TABLE family_members DROP COLUMN ai_aliases"))
                app.dependency_overrides[get_db] = override_get_db
                rate_limit._BUCKETS.clear()
                with patch("app.core.security.get_settings", return_value=settings):
                    owner = {"Authorization": f"Bearer {create_access_token('migration-owner')}"}
                    requester = {"Authorization": f"Bearer {create_access_token('migration-requester')}"}
                    client = TestClient(app, raise_server_exceptions=False)
                    try:
                        self.assertEqual(client.get("/api/auth/me", headers=owner).status_code, 200)
                        self.assertEqual(client.get("/api/families", headers=owner).status_code, 500)
                        self.assertEqual(client.post("/api/families/join", headers=requester,
                                                     json={"invite_code": "QATEST01"}).status_code, 500)

                        command.upgrade(config, "head")
                        self.assertEqual(client.get("/api/families").status_code, 401)
                        families = client.get("/api/families", headers=owner)
                        self.assertEqual(families.status_code, 200, families.text)
                        self.assertEqual(len(families.json()), 1)
                        self.assertEqual(families.json()[0]["current_user_role"], "owner")
                        request = client.post("/api/families/join", headers=requester,
                                              json={"invite_code": "QATEST01"})
                        self.assertEqual(request.status_code, 200, request.text)
                        self.assertEqual(request.json()["status"], "pending")
                        approval = client.post(
                            f"/api/families/current/join-requests/{request.json()['id']}/approve", headers=owner
                        )
                        self.assertEqual(approval.status_code, 200, approval.text)
                        members = client.get("/api/families/current/members", headers=owner)
                        self.assertEqual(members.status_code, 200, members.text)
                        self.assertEqual(len(members.json()), 2)
                        self.assertEqual(client.get("/api/dashboard", headers=owner).status_code, 200)
                        created = client.post("/api/families", headers=owner, json={"name": "QA After Upgrade"})
                        self.assertEqual(created.status_code, 201, created.text)
                        reloaded = client.get("/api/families", headers=owner)
                        self.assertEqual(reloaded.status_code, 200, reloaded.text)
                        self.assertEqual(len(reloaded.json()), 2)
                        active = client.get("/api/families/current", headers=owner)
                        self.assertEqual(active.status_code, 200, active.text)
                        self.assertEqual(active.json()["id"], created.json()["id"])
                    finally:
                        client.close()
            finally:
                rate_limit._BUCKETS.clear()
                app.dependency_overrides.clear()
                app.dependency_overrides.update(previous_overrides)
                engine.dispose()


if __name__ == "__main__":
    unittest.main()
