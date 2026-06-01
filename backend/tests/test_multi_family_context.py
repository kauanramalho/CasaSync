import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.core.deps import get_family_id
from app.database.base import Base
from app.models import Family, FamilyMember, User
from app.routes.tasks import import_suggestions as import_suggestions_route
from app.schemas.category import CategoryCreate
from app.schemas.task import TaskCreate
from app.schemas.task_import import TaskSuggestionImportItem, TaskSuggestionsImportRequest, TaskSuggestionsImportResponse
from app.services.category_service import create_category, list_categories
from app.services.task_service import create_task, get_task, list_tasks


class MultiFamilyContextTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)
        self.db = self.SessionLocal()
        self.user = User(
            id="user-1",
            name="Kauan",
            username="kauan",
            email="kauan@example.com",
            hashed_password="hash",
            is_active=True,
        )
        self.other_user = User(
            id="user-2",
            name="Bia",
            username="bia",
            email="bia@example.com",
            hashed_password="hash",
            is_active=True,
        )
        self.family_a = Family(id="family-a", name="Casa A", invite_code="CASAA1")
        self.family_b = Family(id="family-b", name="Casa B", invite_code="CASAB1")
        self.family_c = Family(id="family-c", name="Casa C", invite_code="CASAC1")
        self.db.add_all([self.user, self.other_user, self.family_a, self.family_b, self.family_c])
        self.db.flush()
        self.db.add_all(
            [
                FamilyMember(id="member-a", family_id=self.family_a.id, user_id=self.user.id, role="owner"),
                FamilyMember(id="member-b", family_id=self.family_b.id, user_id=self.user.id, role="admin"),
                FamilyMember(id="member-c", family_id=self.family_c.id, user_id=self.other_user.id, role="owner"),
            ]
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_get_family_id_uses_requested_or_header_family_and_rejects_non_member(self):
        self.assertEqual(get_family_id(family_id=self.family_b.id, active_family_id=None, current_user=self.user, db=self.db), self.family_b.id)
        self.assertEqual(get_family_id(family_id=None, active_family_id=self.family_b.id, current_user=self.user, db=self.db), self.family_b.id)

        with self.assertRaises(HTTPException):
            get_family_id(family_id=self.family_c.id, active_family_id=None, current_user=self.user, db=self.db)

    def test_tasks_stay_isolated_by_active_family(self):
        task_a = create_task(self.db, self.family_a.id, self.user.id, TaskCreate(title="Tarefa da familia A"))
        task_b = create_task(self.db, self.family_b.id, self.user.id, TaskCreate(title="Tarefa da familia B"))

        self.assertEqual([task.title for task in list_tasks(self.db, self.family_a.id)], [task_a.title])
        self.assertEqual([task.title for task in list_tasks(self.db, self.family_b.id)], [task_b.title])

        with self.assertRaises(HTTPException):
            get_task(self.db, self.family_b.id, task_a.id)

    def test_categories_stay_isolated_by_family(self):
        category_a = create_category(self.db, self.family_a.id, CategoryCreate(name="Mercado", color="blue", icon="shopping-bag"))
        category_b = create_category(self.db, self.family_b.id, CategoryCreate(name="Mercado", color="rose", icon="shopping-bag"))

        self.assertEqual([category.id for category in list_categories(self.db, self.family_a.id)], [category_a.id])
        self.assertEqual([category.id for category in list_categories(self.db, self.family_b.id)], [category_b.id])

    def test_import_suggestions_route_uses_active_family(self):
        payload = TaskSuggestionsImportRequest(
            items=[
                TaskSuggestionImportItem(
                    suggestionId="suggestion-1",
                    title="Consulta",
                    confidence=0.9,
                )
            ],
            syncGoogleCalendar=False,
            autoCreate=False,
        )
        expected = TaskSuggestionsImportResponse()

        with patch("app.routes.tasks.import_task_suggestions", return_value=expected) as import_service:
            result = import_suggestions_route(
                payload=payload,
                current_user=self.user,
                family_id=self.family_b.id,
                db=self.db,
                settings=Settings(),
            )

        self.assertIs(result, expected)
        self.assertEqual(import_service.call_args.kwargs["family_id"], self.family_b.id)
        self.assertEqual(import_service.call_args.kwargs["creator_id"], self.user.id)


if __name__ == "__main__":
    unittest.main()
