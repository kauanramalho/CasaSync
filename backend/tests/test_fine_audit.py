import unittest
import warnings
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database.base import Base
from app.models import Category, Family, FamilyMember, User
from app.core.security import hash_password
from app.schemas.category import CategoryCreate, CategoryUpdate
from app.schemas.couple import CoupleGoalCreate, CoupleGoalUpdate, DateIdeaCreate, DateIdeaUpdate, QuickNoteCreate, QuickNoteUpdate
from app.schemas.family import FamilyCreate, FamilyUpdate
from app.schemas.task import TaskCreate, TaskRead, TaskUpdate
from app.services.auth_service import delete_user_account
from app.services.dashboard_service import get_dashboard
from app.services.task_service import create_task


class FineAuditSchemaTest(unittest.TestCase):
    def test_blank_names_are_rejected_on_create_and_patch(self):
        for schema, field in [(TaskCreate, "title"), (TaskUpdate, "title"), (FamilyCreate, "name"), (FamilyUpdate, "name"), (CategoryCreate, "name"), (CategoryUpdate, "name"), (CoupleGoalCreate, "title"), (CoupleGoalUpdate, "title"), (DateIdeaCreate, "title"), (DateIdeaUpdate, "title"), (QuickNoteCreate, "message"), (QuickNoteUpdate, "message")]:
            for value in ["  ", "\t\n"]:
                with self.subTest(schema=schema.__name__, value=value), self.assertRaises(ValidationError):
                    schema(**{field: value})

    def test_text_is_trimmed_before_length_validation(self):
        self.assertEqual(TaskCreate(title="  Limpar a casa  ").title, "Limpar a casa")
        self.assertEqual(FamilyCreate(name="  Casa  ").name, "Casa")
        with self.assertRaises(ValidationError):
            TaskCreate(title=" a ")

    def test_patch_rejects_explicit_null_required_fields(self):
        for schema in [TaskUpdate, FamilyUpdate, CategoryUpdate, CoupleGoalUpdate, DateIdeaUpdate, QuickNoteUpdate]:
            for field in schema.non_nullable_fields:
                with self.subTest(schema=schema.__name__, field=field), self.assertRaises(ValidationError):
                    schema(**{field: None})

    def test_patch_preserves_omission_and_nullable_relationships(self):
        self.assertEqual(TaskUpdate().model_dump(exclude_unset=True), {})
        self.assertEqual(TaskUpdate(description=None, due_date=None, category_id=None).model_dump(exclude_unset=True), {"description": None, "due_date": None, "category_id": None})
        self.assertIsNone(FamilyUpdate(image_url=None).image_url)


class FineAuditTransactionTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")

        @event.listens_for(self.engine, "connect")
        def enable_foreign_keys(connection, _record):
            connection.execute("PRAGMA foreign_keys=ON")

        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(id="audit-user", name="QA Audit", email="audit-fine@example.com", hashed_password=hash_password("Audit-local-123"), email_verified=True)
        self.peer = User(id="audit-peer", name="QA Peer", email="audit-peer@example.com", hashed_password="test-hash")
        self.first = Family(id="audit-first", name="Primeira", invite_code="AUDIT001")
        self.second = Family(id="audit-second", name="Segunda", invite_code="AUDIT002")
        self.db.add_all([self.user, self.peer, self.first, self.second])
        self.db.flush()
        self.db.add_all([
            FamilyMember(id="audit-member-first", family_id=self.first.id, user_id=self.user.id, role="member"),
            FamilyMember(id="audit-peer-first", family_id=self.first.id, user_id=self.peer.id, role="owner"),
            FamilyMember(id="audit-member-second", family_id=self.second.id, user_id=self.user.id, role="owner"),
            FamilyMember(id="audit-peer-second", family_id=self.second.id, user_id=self.peer.id, role="member"),
        ])
        self.user.active_family_id = self.first.id
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_refused_account_deletion_preserves_all_memberships_and_session(self):
        with self.assertRaises(HTTPException) as error:
            delete_user_account(self.db, self.user, "Audit-local-123")
        self.assertEqual(error.exception.status_code, 409)
        self.db.expire_all()
        self.assertEqual(self.db.query(FamilyMember).filter_by(user_id=self.user.id).count(), 2)
        self.assertTrue(self.user.is_active)
        self.assertEqual(self.user.token_version, 0)
        self.assertEqual(self.user.active_family_id, self.first.id)

    def test_account_deletion_commits_once_and_invalidates_session(self):
        self.db.query(FamilyMember).filter_by(id="audit-peer-second").one().role = "admin"
        self.db.commit()
        with patch.object(self.db, "commit", wraps=self.db.commit) as commit:
            delete_user_account(self.db, self.user, "Audit-local-123")
        self.assertEqual(commit.call_count, 1)
        self.assertEqual(self.db.query(FamilyMember).filter_by(user_id=self.user.id).count(), 0)
        self.assertFalse(self.user.is_active)
        self.assertEqual(self.user.token_version, 1)
        self.assertIsNone(self.user.active_family_id)

    def test_failed_commit_rolls_back_memberships_and_account(self):
        self.db.query(FamilyMember).filter_by(id="audit-peer-second").one().role = "admin"
        self.db.commit()
        with patch.object(self.db, "commit", side_effect=RuntimeError("synthetic commit failure")), self.assertRaises(RuntimeError):
            delete_user_account(self.db, self.user, "Audit-local-123")
        self.db.expire_all()
        self.assertTrue(self.user.is_active)
        self.assertEqual(self.db.query(FamilyMember).filter_by(user_id=self.user.id).count(), 2)

    def test_account_deletion_handles_last_member_family_with_foreign_keys(self):
        self.db.delete(self.db.query(FamilyMember).filter_by(id="audit-peer-second").one())
        self.user.active_family_id = self.second.id
        self.db.commit()
        with patch.object(self.db, "commit", wraps=self.db.commit) as commit:
            delete_user_account(self.db, self.user, "Audit-local-123")
        self.assertEqual(commit.call_count, 1)
        self.assertIsNone(self.db.get(Family, "audit-second"))
        self.assertIsNotNone(self.db.get(Family, "audit-first"))
        self.assertIsNone(self.user.active_family_id)
        self.assertFalse(self.user.is_active)

    def test_dashboard_category_tasks_are_validated_before_serialization(self):
        category = Category(id="audit-category", family_id=self.first.id, name="Casa", color="blue", icon="home")
        self.db.add(category)
        self.db.commit()
        create_task(self.db, self.first.id, self.user.id, TaskCreate(title="Organizar casa", category_id=category.id))
        with warnings.catch_warnings():
            warnings.simplefilter("error", UserWarning)
            dashboard = get_dashboard(self.db, self.first.id)
            self.assertIsInstance(dashboard.tasks_by_category[0].tasks[0], TaskRead)
            payload = dashboard.model_dump(mode="json")
        self.assertEqual(payload["tasks_by_category"][0]["tasks"][0]["priority"], "media")


if __name__ == "__main__":
    unittest.main()
