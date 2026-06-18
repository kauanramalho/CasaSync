import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.core.deps import get_family_id
from app.database.base import Base
from app.models.enums import TaskStatus
from app.models import Family, FamilyMember, User
from app.routes.auth import me as me_route
from app.routes.families import active_family as active_family_route, list_my_families
from app.routes.tasks import import_suggestions as import_suggestions_route
from app.schemas.category import CategoryCreate
from app.schemas.task import TaskCreate
from app.schemas.task_import import TaskSuggestionImportItem, TaskSuggestionsImportRequest, TaskSuggestionsImportResponse
from app.services.category_service import create_category, list_categories
from app.services.dashboard_service import get_dashboard, get_dashboard_summary
from app.services.family_service import decide_join_request, list_members, refresh_user_active_family, request_join_family, set_active_family
from app.services.task_service import create_task, get_task, list_tasks
from app.services.task_import_service import import_task_suggestions


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
        set_active_family(self.db, self.user, self.family_b.id)
        self.assertEqual(get_family_id(family_id=None, active_family_id=None, current_user=self.user, db=self.db), self.family_b.id)
        self.assertEqual(get_family_id(family_id=self.family_b.id, active_family_id=None, current_user=self.user, db=self.db), self.family_b.id)
        self.assertEqual(get_family_id(family_id=None, active_family_id=self.family_b.id, current_user=self.user, db=self.db), self.family_b.id)

        with self.assertRaises(HTTPException):
            get_family_id(family_id=self.family_c.id, active_family_id=None, current_user=self.user, db=self.db)

    def test_active_family_persists_and_auth_me_returns_it(self):
        active_family = set_active_family(self.db, self.user, self.family_b.id)
        self.assertEqual(active_family.id, self.family_b.id)
        self.assertEqual(self.user.active_family_id, self.family_b.id)

        response = me_route(current_user=self.user, db=self.db)
        self.assertEqual(response.active_family_id, self.family_b.id)

        with self.assertRaises(HTTPException):
            set_active_family(self.db, self.user, self.family_c.id)

    def test_legacy_user_without_active_family_recovers_existing_membership(self):
        self.assertIsNone(self.user.active_family_id)

        response = me_route(current_user=self.user, db=self.db)
        active_family = active_family_route(current_user=self.user, db=self.db)

        self.assertEqual(response.active_family_id, self.family_a.id)
        self.assertEqual(active_family.id, self.family_a.id)
        self.assertEqual(self.user.active_family_id, self.family_a.id)
        self.assertEqual([family.id for family in list_my_families(current_user=self.user, db=self.db)], [self.family_a.id, self.family_b.id])

    def test_invalid_active_family_is_corrected_to_valid_membership(self):
        self.user.active_family_id = self.family_c.id
        self.db.add(self.user)
        self.db.commit()

        response = me_route(current_user=self.user, db=self.db)

        self.assertEqual(response.active_family_id, self.family_a.id)
        self.assertEqual(self.user.active_family_id, self.family_a.id)

    def test_orphan_active_family_reference_does_not_break_auth_me(self):
        self.db.add(FamilyMember(id="member-orphan", family_id="missing-family", user_id=self.user.id, role="member"))
        self.user.active_family_id = "missing-family"
        self.db.add(self.user)
        self.db.commit()

        response = me_route(current_user=self.user, db=self.db)

        self.assertEqual(response.active_family_id, self.family_a.id)
        self.assertEqual(self.user.active_family_id, self.family_a.id)

    def test_empty_family_header_uses_backend_fallback(self):
        self.assertEqual(get_family_id(family_id=None, active_family_id="   ", current_user=self.user, db=self.db), self.family_a.id)
        self.assertEqual(self.user.active_family_id, self.family_a.id)

    def test_user_without_real_family_still_has_empty_state(self):
        lonely_user = User(
            id="user-lonely",
            name="Sem Familia",
            username="semfamilia",
            email="semfamilia@example.com",
            hashed_password="hash",
            is_active=True,
        )
        self.db.add(lonely_user)
        self.db.commit()

        self.assertEqual(list_my_families(current_user=lonely_user, db=self.db), [])
        with self.assertRaises(HTTPException):
            active_family_route(current_user=lonely_user, db=self.db)

    def test_active_family_falls_back_when_membership_is_removed(self):
        set_active_family(self.db, self.user, self.family_b.id)
        member = self.db.query(FamilyMember).filter(FamilyMember.family_id == self.family_b.id, FamilyMember.user_id == self.user.id).one()
        self.db.delete(member)
        self.db.commit()

        fallback = refresh_user_active_family(self.db, self.user.id)

        self.assertEqual(fallback.id, self.family_a.id)
        self.assertEqual(self.user.active_family_id, self.family_a.id)

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

    def test_members_and_dashboard_are_scoped_to_family(self):
        create_task(self.db, self.family_a.id, self.user.id, TaskCreate(title="Tarefa da familia A"))
        create_task(self.db, self.family_b.id, self.user.id, TaskCreate(title="Tarefa da familia B"))

        self.assertEqual([member.family_id for member in list_members(self.db, self.family_a.id)], [self.family_a.id])
        dashboard_a = get_dashboard(self.db, self.family_a.id)
        dashboard_b = get_dashboard(self.db, self.family_b.id)

        self.assertEqual([task.title for task in dashboard_a.recent_tasks], ["Tarefa da familia A"])
        self.assertEqual([task.title for task in dashboard_b.recent_tasks], ["Tarefa da familia B"])

    def test_dashboard_summary_is_scoped_to_family(self):
        create_task(self.db, self.family_a.id, self.user.id, TaskCreate(title="Pendente A"))
        create_task(self.db, self.family_a.id, self.user.id, TaskCreate(title="Concluida A", status=TaskStatus.DONE))
        create_task(self.db, self.family_a.id, self.user.id, TaskCreate(title="Atrasada A", status=TaskStatus.OVERDUE))
        create_task(self.db, self.family_b.id, self.user.id, TaskCreate(title="Concluida B", status=TaskStatus.DONE))

        summary_a = get_dashboard_summary(self.db, self.family_a.id)
        summary_b = get_dashboard_summary(self.db, self.family_b.id)

        self.assertEqual((summary_a.done, summary_a.pending, summary_a.overdue, summary_a.total), (1, 1, 1, 3))
        self.assertEqual(summary_a.points, 10)
        self.assertEqual((summary_b.done, summary_b.pending, summary_b.overdue, summary_b.total), (1, 0, 0, 1))
        self.assertEqual(summary_b.points, 10)

    def test_task_creation_rejects_foreign_category_and_assignee(self):
        category_b = create_category(self.db, self.family_b.id, CategoryCreate(name="Categoria B", color="rose", icon="heart"))

        with self.assertRaises(HTTPException):
            create_task(self.db, self.family_a.id, self.user.id, TaskCreate(title="Categoria errada", category_id=category_b.id))

        with self.assertRaises(HTTPException):
            create_task(self.db, self.family_a.id, self.user.id, TaskCreate(title="Responsavel errado", assignee_ids=[self.other_user.id]))

    def test_join_request_stays_pending_until_family_admin_approves(self):
        join_request = request_join_family(self.db, self.family_c.invite_code, self.user.id)

        with self.assertRaises(HTTPException):
            get_family_id(family_id=self.family_c.id, active_family_id=None, current_user=self.user, db=self.db)

        with self.assertRaises(HTTPException):
            decide_join_request(self.db, self.family_c.id, self.user.id, join_request.id, True)

        approved = decide_join_request(self.db, self.family_c.id, self.other_user.id, join_request.id, True)

        self.assertEqual(approved.status, "approved")
        self.assertEqual(get_family_id(family_id=self.family_c.id, active_family_id=None, current_user=self.user, db=self.db), self.family_c.id)

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

    def test_reviewed_ai_suggestion_creates_task_for_selected_family_member(self):
        self.db.add(FamilyMember(id="member-bia-family-a", family_id=self.family_a.id, user_id=self.other_user.id, role="member"))
        self.db.commit()
        item = TaskSuggestionImportItem(
            suggestionId="suggestion-assignee",
            title="Lavar a louca",
            originalText="Bia lavar a louca hoje",
            assigneeIds=[self.other_user.id],
            confidence=0.95,
        )

        result = import_task_suggestions(
            self.db,
            family_id=self.family_a.id,
            creator_id=self.user.id,
            items=[item],
            settings=Settings(),
        )

        self.assertEqual(len(result.created), 1)
        task = get_task(self.db, self.family_a.id, result.created[0].taskId)
        self.assertEqual(task.assignee_ids, [self.other_user.id])


if __name__ == "__main__":
    unittest.main()
