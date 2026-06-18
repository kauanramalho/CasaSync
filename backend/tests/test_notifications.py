import json
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.database.base import Base
from app.models import Family, FamilyMember, Notification, User, WebPushSubscription
from app.schemas.task import TaskCreate, TaskUpdate
from app.services.notification_service import (
    _push_payload,
    disable_web_push_subscription,
    has_active_web_push_subscription,
    process_due_task_reminders,
)
from app.services.task_service import complete_task, create_task, delete_task, update_task


class NotificationFlowTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)
        self.db = self.SessionLocal()
        self.creator = User(
            id="user-creator",
            name="Kauan",
            username="kauan-notifications",
            email="kauan-notifications@example.com",
            hashed_password="hash",
            is_active=True,
        )
        self.assignee = User(
            id="user-assignee",
            name="Bia",
            username="bia-notifications",
            email="bia-notifications@example.com",
            hashed_password="hash",
            is_active=True,
        )
        self.outsider = User(
            id="user-outsider",
            name="Outra pessoa",
            username="outsider-notifications",
            email="outsider-notifications@example.com",
            hashed_password="hash",
            is_active=True,
        )
        self.family = Family(id="family-notifications", name="Casa", invite_code="NOTIFY1")
        self.other_family = Family(id="family-other", name="Outra casa", invite_code="NOTIFY2")
        self.db.add_all([self.creator, self.assignee, self.outsider, self.family, self.other_family])
        self.db.flush()
        self.db.add_all(
            [
                FamilyMember(id="member-creator", family_id=self.family.id, user_id=self.creator.id, role="owner"),
                FamilyMember(id="member-assignee", family_id=self.family.id, user_id=self.assignee.id, role="member"),
                FamilyMember(id="member-outsider", family_id=self.other_family.id, user_id=self.outsider.id, role="owner"),
            ]
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def assignment_notifications(self):
        return self.db.query(Notification).filter(Notification.type == "task_assigned").all()

    def reminder_notifications(self):
        return self.db.query(Notification).filter(Notification.type == "reminder").all()

    def test_assignment_notifies_only_other_family_assignee(self):
        task = create_task(
            self.db,
            self.family.id,
            self.creator.id,
            TaskCreate(title="Comprar mantimentos", assignee_ids=[self.creator.id, self.assignee.id]),
        )

        notifications = self.assignment_notifications()
        self.assertEqual(len(notifications), 1)
        self.assertEqual(notifications[0].user_id, self.assignee.id)
        self.assertEqual(notifications[0].family_id, self.family.id)
        self.assertEqual(notifications[0].task_id, task.id)
        self.assertIn(task.title, notifications[0].description)
        self.assertNotEqual(notifications[0].user_id, self.outsider.id)

    def test_repeating_same_assignment_does_not_duplicate_notification(self):
        task = create_task(
            self.db,
            self.family.id,
            self.creator.id,
            TaskCreate(title="Organizar cozinha", assignee_ids=[self.creator.id]),
        )

        update_task(self.db, self.family.id, task.id, TaskUpdate(assignee_ids=[self.creator.id, self.assignee.id]))
        update_task(self.db, self.family.id, task.id, TaskUpdate(assignee_ids=[self.creator.id, self.assignee.id]))

        notifications = self.assignment_notifications()
        self.assertEqual(len(notifications), 1)
        self.assertEqual(notifications[0].user_id, self.assignee.id)

    def test_due_reminder_is_idempotent_and_uses_local_timezone(self):
        reference = datetime.now(timezone.utc).replace(microsecond=0)
        task = create_task(
            self.db,
            self.family.id,
            self.creator.id,
            TaskCreate(
                title="Consulta",
                assignee_ids=[self.assignee.id],
                due_date=reference + timedelta(hours=2),
                reminders=[{"value": 1, "unit": "hours"}],
            ),
        )

        first = process_due_task_reminders(self.db, family_id=self.family.id, now=reference + timedelta(hours=1, minutes=1))
        second = process_due_task_reminders(self.db, family_id=self.family.id, now=reference + timedelta(hours=1, minutes=2))

        self.assertEqual(first.created, 2)
        self.assertEqual(second.created, 0)
        self.assertEqual(len(self.reminder_notifications()), 2)
        with patch("app.services.notification_service.get_settings", return_value=Settings(google_calendar_default_timezone="America/Sao_Paulo")):
            payload = json.loads(_push_payload(task, task.reminders[0].id))
        stored_due_date = task.due_date if task.due_date.tzinfo else task.due_date.replace(tzinfo=timezone.utc)
        expected_local_time = stored_due_date.astimezone(timezone(timedelta(hours=-3))).strftime("%H:%M")
        self.assertIn(expected_local_time, payload["body"])
        self.assertEqual(payload["taskId"], task.id)

    def test_completed_deleted_and_reopened_tasks_handle_reminders_safely(self):
        reference = datetime.now(timezone.utc).replace(microsecond=0)
        task = create_task(
            self.db,
            self.family.id,
            self.creator.id,
            TaskCreate(
                title="Lembrete futuro",
                due_date=reference + timedelta(hours=3),
                reminders=[{"value": 1, "unit": "hours"}],
            ),
        )

        complete_task(self.db, self.family.id, task.id)
        self.assertTrue(task.reminders[0].sent)
        process_due_task_reminders(self.db, family_id=self.family.id, now=reference + timedelta(hours=2, minutes=1))
        self.assertEqual(len(self.reminder_notifications()), 0)

        reopened = complete_task(self.db, self.family.id, task.id)
        self.assertFalse(reopened.reminders[0].sent)
        result = process_due_task_reminders(self.db, family_id=self.family.id, now=reference + timedelta(hours=2, minutes=1))
        self.assertEqual(result.created, 1)

        deletable = create_task(
            self.db,
            self.family.id,
            self.creator.id,
            TaskCreate(
                title="Excluir antes",
                due_date=reference + timedelta(hours=4),
                reminders=[{"value": 1, "unit": "hours"}],
            ),
        )
        delete_task(self.db, self.family.id, deletable.id)
        after_delete = process_due_task_reminders(self.db, family_id=self.family.id, now=reference + timedelta(hours=3, minutes=1))
        self.assertEqual(after_delete.created, 0)

    def test_task_without_date_and_multiple_device_subscription_fallback(self):
        task = create_task(self.db, self.family.id, self.creator.id, TaskCreate(title="Sem data"))
        self.assertIsNone(task.due_date)
        self.assertFalse(task.reminders)

        self.db.add_all(
            [
                WebPushSubscription(
                    id="push-1",
                    family_id=self.family.id,
                    user_id=self.creator.id,
                    endpoint="https://push.example/device-1",
                    p256dh="p" * 24,
                    auth="a" * 16,
                    is_active=True,
                ),
                WebPushSubscription(
                    id="push-2",
                    family_id=self.family.id,
                    user_id=self.creator.id,
                    endpoint="https://push.example/device-2",
                    p256dh="q" * 24,
                    auth="b" * 16,
                    is_active=True,
                ),
            ]
        )
        self.db.commit()

        disable_web_push_subscription(self.db, user_id=self.creator.id, endpoint="https://push.example/device-1")
        self.assertTrue(has_active_web_push_subscription(self.db, user_id=self.creator.id))
        disable_web_push_subscription(self.db, user_id=self.creator.id, endpoint="https://push.example/device-2")
        self.assertFalse(has_active_web_push_subscription(self.db, user_id=self.creator.id))


if __name__ == "__main__":
    unittest.main()
