import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.database.base import Base
from app.models import Family, FamilyMember, GoogleCalendarConnection, Task, User
from app.routes.tasks import delete as delete_task_route
from app.schemas.task import TaskDeleteRequest
from app.services.calendar_provider_adapter import CalendarProviderAuthError
from app.services.calendar_service import delete_task_calendar_event
from app.services.task_service import delete_task, list_tasks


class FakeCalendarAdapter:
    def __init__(self, *, deleted=True, error=None):
        self.deleted = deleted
        self.error = error
        self.deleted_event_ids = []

    def delete_event(self, *, calendar_id, access_token, event_id, timeout_seconds):
        self.deleted_event_ids.append(event_id)
        if self.error:
            raise self.error
        return self.deleted


class TaskDeletionTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)
        self.db = self.SessionLocal()
        self.family = Family(id="family-1", name="Casa", invite_code="ABC123")
        self.user = User(
            id="user-1",
            name="Kauan",
            username="kauan",
            email="kauan@example.com",
            hashed_password="hash",
            is_active=True,
        )
        self.db.add_all([self.family, self.user])
        self.db.flush()
        self.db.add(FamilyMember(id="member-1", family_id=self.family.id, user_id=self.user.id, role="admin"))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def create_task(self, **overrides):
        task = Task(
            id=overrides.pop("id", "task-1"),
            family_id=self.family.id,
            title=overrides.pop("title", "Tarefa teste"),
            creator_id=self.user.id,
            assignee_id=self.user.id,
            due_date=overrides.pop("due_date", datetime(2026, 6, 5, 15, 0, tzinfo=timezone.utc)),
            google_calendar_event_id=overrides.pop("google_calendar_event_id", None),
            google_calendar_synced_by_id=overrides.pop("google_calendar_synced_by_id", None),
            **overrides,
        )
        self.db.add(task)
        self.db.commit()
        return task

    def create_google_connection(self):
        connection = GoogleCalendarConnection(
            id="google-connection-1",
            family_id=self.family.id,
            user_id=self.user.id,
            calendar_id="primary",
            is_connected=True,
            access_token_encrypted="encrypted-access",
            refresh_token_encrypted="encrypted-refresh",
        )
        self.db.add(connection)
        self.db.commit()
        return connection

    def test_delete_task_removes_from_normal_listings(self):
        task = self.create_task()
        self.assertEqual([item.id for item in list_tasks(self.db, self.family.id)], [task.id])

        delete_task(self.db, self.family.id, task.id)

        self.assertEqual(list_tasks(self.db, self.family.id), [])
        self.assertIsNone(self.db.get(Task, task.id))

    def test_google_event_delete_success_can_precede_local_delete(self):
        task = self.create_task(google_calendar_event_id="event-1", google_calendar_synced_by_id=self.user.id)
        self.create_google_connection()
        adapter = FakeCalendarAdapter(deleted=True)
        settings = Settings(google_calendar_enabled=True)

        with (
            patch("app.services.calendar_service.get_calendar_provider_adapter", return_value=adapter),
            patch("app.services.calendar_service._connection_access_token", return_value="access-token"),
        ):
            result = delete_task_calendar_event(
                self.db,
                family_id=self.family.id,
                user_id=self.user.id,
                task_id=task.id,
                settings=settings,
            )

        self.assertTrue(result.deleted)
        self.assertEqual(adapter.deleted_event_ids, ["event-1"])
        delete_task(self.db, self.family.id, task.id)
        self.assertIsNone(self.db.get(Task, task.id))

    def test_google_event_missing_still_allows_local_delete(self):
        task = self.create_task(google_calendar_event_id="event-missing", google_calendar_synced_by_id=self.user.id)
        self.create_google_connection()
        adapter = FakeCalendarAdapter(deleted=False)
        settings = Settings(google_calendar_enabled=True)

        with (
            patch("app.services.calendar_service.get_calendar_provider_adapter", return_value=adapter),
            patch("app.services.calendar_service._connection_access_token", return_value="access-token"),
        ):
            result = delete_task_calendar_event(
                self.db,
                family_id=self.family.id,
                user_id=self.user.id,
                task_id=task.id,
                settings=settings,
            )

        self.assertFalse(result.deleted)
        self.assertTrue(result.missing)
        delete_task(self.db, self.family.id, task.id)
        self.assertIsNone(self.db.get(Task, task.id))

    def test_google_auth_error_blocks_local_delete_when_requested(self):
        task = self.create_task(google_calendar_event_id="event-locked", google_calendar_synced_by_id=self.user.id)
        self.create_google_connection()
        adapter = FakeCalendarAdapter(error=CalendarProviderAuthError("token invalido"))
        settings = Settings(google_calendar_enabled=True)

        with (
            patch("app.services.calendar_service.get_calendar_provider_adapter", return_value=adapter),
            patch("app.services.calendar_service._connection_access_token", return_value="access-token"),
        ):
            with self.assertRaises(HTTPException):
                delete_task_calendar_event(
                    self.db,
                    family_id=self.family.id,
                    user_id=self.user.id,
                    task_id=task.id,
                    settings=settings,
                )

        self.assertIsNotNone(self.db.get(Task, task.id))

    def test_route_delete_google_false_does_not_call_calendar(self):
        task = self.create_task(google_calendar_event_id="event-kept", google_calendar_synced_by_id=self.user.id)

        with patch("app.routes.tasks.delete_task_calendar_event") as delete_event:
            response = delete_task_route(
                task.id,
                payload=TaskDeleteRequest(deleteGoogleEvent=False),
                current_user=self.user,
                family_id=self.family.id,
                db=self.db,
                settings=Settings(google_calendar_enabled=True),
            )

        delete_event.assert_not_called()
        self.assertTrue(response.deleted)
        self.assertFalse(response.google_calendar_event_deleted)
        self.assertIsNone(self.db.get(Task, task.id))

    def test_route_delete_google_failure_keeps_local_task(self):
        task = self.create_task(google_calendar_event_id="event-fails", google_calendar_synced_by_id=self.user.id)

        with patch("app.routes.tasks.delete_task_calendar_event", side_effect=HTTPException(status_code=502, detail="falhou")):
            with self.assertRaises(HTTPException):
                delete_task_route(
                    task.id,
                    payload=TaskDeleteRequest(deleteGoogleEvent=True),
                    current_user=self.user,
                    family_id=self.family.id,
                    db=self.db,
                    settings=Settings(google_calendar_enabled=True),
                )

        self.assertIsNotNone(self.db.get(Task, task.id))


if __name__ == "__main__":
    unittest.main()
