import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.database.base import Base
from app.models import (
    Family,
    FamilyMember,
    GoogleCalendarFamilySettings,
    GoogleCalendarUserConnection,
    Task,
    User,
)
from app.services.calendar_service import (
    delete_task_calendar_event,
    get_google_calendar_status,
    sync_task_to_calendar,
)
from fastapi import HTTPException
from app.services.calendar_provider_adapter import CalendarProviderNotFoundError


class FakeCalendarAdapter:
    def __init__(self, *, found_event_id=None, update_error=None):
        self.created_events = []
        self.updated_events = []
        self.created_calendars = []
        self.found_event_id = found_event_id
        self.update_error = update_error

    def find_event_by_task_id(self, *, calendar_id, access_token, task_id, timeout_seconds):
        return self.found_event_id

    def create_event(self, *, calendar_id, access_token, event_payload, timeout_seconds):
        self.created_events.append({"calendar_id": calendar_id, "payload": event_payload})
        return f"event-{len(self.created_events)}"

    def update_event(self, *, calendar_id, access_token, event_id, event_payload, timeout_seconds):
        if self.update_error:
            error = self.update_error
            self.update_error = None
            raise error
        self.updated_events.append({"calendar_id": calendar_id, "event_id": event_id, "payload": event_payload})
        return event_id

    def create_calendar(self, *, access_token, summary, time_zone, timeout_seconds):
        self.created_calendars.append({"summary": summary, "time_zone": time_zone})
        return {"id": f"calendar-{len(self.created_calendars)}", "summary": summary}


class GoogleCalendarMultiFamilyTest(unittest.TestCase):
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
        self.family_a = Family(id="family-a", name="Kauan e Bia", invite_code="AAA111")
        self.family_b = Family(id="family-b", name="Familia Ramalho", invite_code="BBB222")
        self.db.add_all([self.user, self.other_user, self.family_a, self.family_b])
        self.db.flush()
        self.db.add_all(
            [
                FamilyMember(id="member-a", family_id=self.family_a.id, user_id=self.user.id, role="admin"),
                FamilyMember(id="member-b", family_id=self.family_b.id, user_id=self.user.id, role="admin"),
                FamilyMember(id="member-a-bia", family_id=self.family_a.id, user_id=self.other_user.id, role="member"),
                GoogleCalendarUserConnection(
                    id="google-user-connection",
                    user_id=self.user.id,
                    is_connected=True,
                    access_token_encrypted="encrypted-access",
                    refresh_token_encrypted="encrypted-refresh",
                ),
            ]
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def create_task(self, family, **overrides):
        task = Task(
            id=overrides.pop("id", f"task-{family.id}"),
            family_id=family.id,
            title=overrides.pop("title", "Cinema Shopping Boulevard"),
            description=overrides.pop("description", "Sessao de cinema"),
            creator_id=self.user.id,
            assignee_id=self.user.id,
            due_date=overrides.pop("due_date", datetime(2026, 6, 5, 15, 0, tzinfo=timezone.utc)),
            google_calendar_event_id=overrides.pop("google_calendar_event_id", None),
            google_calendar_id=overrides.pop("google_calendar_id", None),
            google_calendar_synced_by_id=overrides.pop("google_calendar_synced_by_id", None),
            **overrides,
        )
        self.db.add(task)
        self.db.commit()
        return task

    def sync_with_fake_adapter(self, task, family, adapter):
        with (
            patch("app.services.calendar_service.get_calendar_provider_adapter", return_value=adapter),
            patch("app.services.calendar_service._connection_access_token", return_value="access-token"),
        ):
            return sync_task_to_calendar(
                self.db,
                family_id=family.id,
                user_id=self.user.id,
                task_id=task.id,
                settings=Settings(
                    google_calendar_enabled=True,
                    google_client_id="test-client-id",
                    google_client_secret="test-client-secret",
                    google_redirect_uri="https://example.test/google-callback",
                    integration_token_encryption_key="test-only-encryption-key",
                ),
            )

    def test_primary_mode_uses_same_google_account_with_family_metadata(self):
        adapter = FakeCalendarAdapter()
        task_a = self.create_task(self.family_a, id="task-a")
        task_b = self.create_task(self.family_b, id="task-b", title="Consulta da mae")

        result_a = self.sync_with_fake_adapter(task_a, self.family_a, adapter)
        result_b = self.sync_with_fake_adapter(task_b, self.family_b, adapter)

        self.assertTrue(result_a.synced)
        self.assertTrue(result_b.synced)
        self.assertEqual([item["calendar_id"] for item in adapter.created_events], ["primary", "primary"])
        payload_a = adapter.created_events[0]["payload"]
        payload_b = adapter.created_events[1]["payload"]
        self.assertIn("[CasaSync - Kauan e Bia]", payload_a["summary"])
        self.assertEqual(payload_a["extendedProperties"]["private"]["casasync_family_id"], self.family_a.id)
        self.assertIn("Responsaveis: Kauan", payload_a["description"])
        self.assertIn("[CasaSync - Familia Ramalho]", payload_b["summary"])
        self.assertEqual(payload_b["extendedProperties"]["private"]["casasync_family_id"], self.family_b.id)
        self.assertEqual(self.db.get(Task, task_a.id).google_calendar_id, "primary")
        self.assertEqual(self.db.get(Task, task_b.id).google_calendar_id, "primary")

    def test_family_calendar_mode_uses_family_specific_calendar_id(self):
        self.db.add_all(
            [
                GoogleCalendarFamilySettings(
                    id="settings-a",
                    family_id=self.family_a.id,
                    user_id=self.user.id,
                    mode="family_calendar",
                    google_calendar_id="calendar-family-a",
                    google_calendar_name="CasaSync - Kauan e Bia",
                ),
                GoogleCalendarFamilySettings(
                    id="settings-b",
                    family_id=self.family_b.id,
                    user_id=self.user.id,
                    mode="family_calendar",
                    google_calendar_id="calendar-family-b",
                    google_calendar_name="CasaSync - Familia Ramalho",
                ),
            ]
        )
        self.db.commit()
        adapter = FakeCalendarAdapter()
        task_a = self.create_task(self.family_a, id="task-family-a")
        task_b = self.create_task(self.family_b, id="task-family-b")

        self.sync_with_fake_adapter(task_a, self.family_a, adapter)
        self.sync_with_fake_adapter(task_b, self.family_b, adapter)

        self.assertEqual([item["calendar_id"] for item in adapter.created_events], ["calendar-family-a", "calendar-family-b"])
        self.assertEqual(self.db.get(Task, task_a.id).google_calendar_id, "calendar-family-a")
        self.assertEqual(self.db.get(Task, task_b.id).google_calendar_id, "calendar-family-b")

    def test_family_calendar_mode_creates_calendar_once_when_missing(self):
        self.db.add(
            GoogleCalendarFamilySettings(
                id="settings-a",
                family_id=self.family_a.id,
                user_id=self.user.id,
                mode="family_calendar",
            )
        )
        self.db.commit()
        adapter = FakeCalendarAdapter()
        task = self.create_task(self.family_a, id="task-created-calendar")

        result = self.sync_with_fake_adapter(task, self.family_a, adapter)

        self.assertTrue(result.synced)
        self.assertEqual(adapter.created_calendars, [{"summary": "CasaSync - Kauan e Bia", "time_zone": "America/Sao_Paulo"}])
        self.assertEqual(adapter.created_events[0]["calendar_id"], "calendar-1")
        settings_row = self.db.get(GoogleCalendarFamilySettings, "settings-a")
        self.assertEqual(settings_row.google_calendar_id, "calendar-1")
        self.assertEqual(self.db.get(Task, task.id).google_calendar_id, "calendar-1")

    def test_update_uses_calendar_id_saved_on_task(self):
        self.db.add(
            GoogleCalendarFamilySettings(
                id="settings-a",
                family_id=self.family_a.id,
                user_id=self.user.id,
                mode="primary",
            )
        )
        self.db.commit()
        adapter = FakeCalendarAdapter()
        task = self.create_task(
            self.family_a,
            id="task-existing",
            google_calendar_event_id="google-event-1",
            google_calendar_id="calendar-original",
            google_calendar_synced_by_id=self.user.id,
        )

        result = self.sync_with_fake_adapter(task, self.family_a, adapter)

        self.assertTrue(result.synced)
        self.assertEqual(adapter.updated_events[0]["calendar_id"], "calendar-original")
        self.assertEqual(adapter.updated_events[0]["event_id"], "google-event-1")

    def test_legacy_synced_task_without_calendar_id_updates_primary(self):
        self.db.add(
            GoogleCalendarFamilySettings(
                id="settings-a",
                family_id=self.family_a.id,
                user_id=self.user.id,
                mode="family_calendar",
                google_calendar_id="calendar-new-family",
                google_calendar_name="CasaSync - Kauan e Bia",
            )
        )
        self.db.commit()
        adapter = FakeCalendarAdapter()
        task = self.create_task(
            self.family_a,
            id="task-legacy-existing",
            google_calendar_event_id="google-event-legacy",
            google_calendar_synced_by_id=self.user.id,
        )

        result = self.sync_with_fake_adapter(task, self.family_a, adapter)

        self.assertTrue(result.synced)
        self.assertEqual(adapter.updated_events[0]["calendar_id"], "primary")
        self.assertEqual(self.db.get(Task, task.id).google_calendar_id, "primary")

    def test_stale_event_id_is_recovered_without_leaving_task_broken(self):
        task = self.create_task(
            self.family_a,
            id="task-stale-event",
            google_calendar_event_id="deleted-google-event",
            google_calendar_id="primary",
            google_calendar_synced_by_id=self.user.id,
        )
        adapter = FakeCalendarAdapter(update_error=CalendarProviderNotFoundError("missing"))

        result = self.sync_with_fake_adapter(task, self.family_a, adapter)

        self.assertTrue(result.synced)
        self.assertEqual(result.status, "synced")
        self.assertEqual(len(adapter.created_events), 1)
        self.assertEqual(self.db.get(Task, task.id).google_calendar_event_id, "event-1")

    def test_orphan_provider_event_is_updated_and_linked_instead_of_duplicated(self):
        task = self.create_task(self.family_a, id="task-orphan-provider-event")
        adapter = FakeCalendarAdapter(found_event_id="provider-event-existing")

        result = self.sync_with_fake_adapter(task, self.family_a, adapter)

        self.assertEqual(result.status, "already_synced")
        self.assertEqual(adapter.created_events, [])
        self.assertEqual(adapter.updated_events[0]["event_id"], "provider-event-existing")
        self.assertEqual(self.db.get(Task, task.id).google_calendar_event_id, "provider-event-existing")

    def test_event_owned_by_another_member_is_not_copied_to_current_users_calendar(self):
        task = self.create_task(
            self.family_a,
            id="task-other-google-account",
            google_calendar_event_id="bia-google-event",
            google_calendar_id="primary",
            google_calendar_synced_by_id=self.other_user.id,
        )
        adapter = FakeCalendarAdapter()

        result = self.sync_with_fake_adapter(task, self.family_a, adapter)

        self.assertEqual(result.status, "account_mismatch")
        self.assertFalse(result.synced)
        self.assertEqual(adapter.created_events, [])
        self.assertEqual(adapter.updated_events, [])

    def test_event_owned_by_another_member_cannot_use_their_connection_for_delete(self):
        task = self.create_task(
            self.family_a,
            id="task-other-google-delete",
            google_calendar_event_id="bia-google-event",
            google_calendar_id="primary",
            google_calendar_synced_by_id=self.other_user.id,
        )

        with self.assertRaises(HTTPException) as error:
            delete_task_calendar_event(
                self.db,
                family_id=self.family_a.id,
                user_id=self.user.id,
                task_id=task.id,
                settings=Settings(
                    google_calendar_enabled=True,
                    google_client_id="test-client-id",
                    google_client_secret="test-client-secret",
                    google_redirect_uri="https://example.test/google-callback",
                    integration_token_encryption_key="test-only-encryption-key",
                ),
            )

        self.assertEqual(error.exception.status_code, 409)

    def test_status_is_family_scoped(self):
        self.db.add(
            GoogleCalendarFamilySettings(
                id="settings-a",
                family_id=self.family_a.id,
                user_id=self.user.id,
                mode="family_calendar",
                google_calendar_id="calendar-family-a",
                google_calendar_name="CasaSync - Kauan e Bia",
            )
        )
        self.db.commit()

        status_a = get_google_calendar_status(self.db, self.family_a.id, self.user.id, Settings(google_calendar_enabled=True))
        status_b = get_google_calendar_status(self.db, self.family_b.id, self.user.id, Settings(google_calendar_enabled=True))

        self.assertEqual(status_a.mode, "family_calendar")
        self.assertEqual(status_a.effective_calendar_id, "calendar-family-a")
        self.assertEqual(status_b.mode, "primary")
        self.assertEqual(status_b.effective_calendar_id, "primary")


if __name__ == "__main__":
    unittest.main()
