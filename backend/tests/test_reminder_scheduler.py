import io
import json
import unittest
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.database.session import get_db
from app.models import Notification, Task, TaskReminder
from app.models.enums import TaskStatus
from app.routes import notifications
from app.services.notification_service import process_due_task_reminders
from app.services.reminder_lock import reminder_delivery_lock
from reminder_scheduler import API_ORIGIN, NoRedirects, RESULT_FIELDS, main, run_scheduler
from tests import test_notifications as notification_fixtures


TOKEN = "isolated-scheduler-credential-not-a-real-secret"
TOKEN_HASH = sha256(TOKEN.encode()).hexdigest()


class SchedulerAuthorizationTest(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(notifications.router, prefix="/api")
        app.dependency_overrides[get_db] = lambda: MagicMock()
        self.client = TestClient(app)
        self.endpoint = "/api/notifications/reminders/scheduled"

    def test_disabled_and_missing_config_fail_closed(self):
        for settings in (Settings(_env_file=None), SimpleNamespace(reminder_scheduler_enabled=True,
                                                                  reminder_scheduler_token_sha256=None)):
            with patch.object(notifications, "get_settings", return_value=settings), \
                 patch.object(notifications, "process_due_task_reminders") as process:
                response = self.client.post(self.endpoint, headers={"Authorization": f"Bearer {TOKEN}"})
            self.assertEqual(response.status_code, 404)
            process.assert_not_called()

    def test_only_dedicated_credential_can_process_all_families(self):
        settings = Settings(_env_file=None, reminder_scheduler_enabled=True, reminder_scheduler_token_sha256=TOKEN_HASH)
        for headers in ({}, {"Authorization": "Bearer user-jwt"}, {"Authorization": f"Basic {TOKEN}"},
                        {"Authorization": f"Bearer {TOKEN_HASH}"}):
            with patch.object(notifications, "get_settings", return_value=settings), \
                 patch.object(notifications, "process_due_task_reminders") as process:
                response = self.client.post(self.endpoint, headers=headers)
            self.assertEqual(response.status_code, 401)
            process.assert_not_called()
        with patch.object(notifications, "get_settings", return_value=settings), \
             patch.object(notifications, "process_due_task_reminders", return_value={"created": 2}) as process:
            response = self.client.post(self.endpoint, headers={"Authorization": f"Bearer {TOKEN}"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["created"], 2)
        process.assert_called_once()
        self.assertEqual(process.call_args.kwargs, {"batch_limit": 25, "max_duration_seconds": 45})
        with patch.object(notifications, "get_settings", return_value=settings), self.assertRaises(HTTPException):
            notifications.require_reminder_scheduler("Bearer incorreto-ç")

    def test_weak_and_reused_credentials_are_rejected_at_startup(self):
        for key in (None, "short", "change-me-in-production"):
            with self.assertRaises(ValidationError):
                Settings(_env_file=None, reminder_scheduler_enabled=True, reminder_scheduler_token_sha256=key)
        with self.assertRaises(ValidationError):
            Settings(_env_file=None, reminder_scheduler_enabled=True, reminder_scheduler_token_sha256=TOKEN_HASH,
                     jwt_secret_key=TOKEN)


class ScheduledDeliveryTest(unittest.TestCase):
    setUp = notification_fixtures.NotificationFlowTest.setUp
    tearDown = notification_fixtures.NotificationFlowTest.tearDown

    def make_due(self, *, family_id=None, creator_id=None, legacy=False):
        now = datetime.now(timezone.utc)
        task = Task(title="Teste isolado", family_id=family_id or self.family.id,
                    creator_id=creator_id or self.creator.id, reminder_enabled=True,
                    reminder_at=now - timedelta(minutes=1), reminder_sent=False)
        self.db.add(task)
        self.db.flush()
        if not legacy:
            self.db.add(TaskReminder(task_id=task.id, family_id=task.family_id, value=1, unit="minutes",
                                     reminder_at=task.reminder_at, sent=False))
        self.db.commit()
        return task

    def test_background_delivery_preserves_family_and_user_opt_in(self):
        self.creator.push_task_reminders_enabled = True
        self.db.commit()
        self.make_due()
        self.make_due(family_id=self.other_family.id, creator_id=self.outsider.id)
        with patch("app.services.notification_service.send_task_reminder_push", return_value="sent") as sender:
            first = process_due_task_reminders(self.db)
            second = process_due_task_reminders(self.db)
        self.assertEqual(first.created, 3)  # Both members of Casa, plus the other family's owner.
        self.assertEqual(first.push_sent, 1)
        self.assertEqual(second.created, 0)
        sender.assert_called_once()
        self.assertEqual(sender.call_args.kwargs["family_id"], self.family.id)
        self.assertEqual(sender.call_args.kwargs["user_id"], self.creator.id)

    def test_batch_limit_applies_to_current_and_legacy_reminders(self):
        self.make_due()
        self.make_due(legacy=True)
        first = process_due_task_reminders(self.db, batch_limit=1)
        second = process_due_task_reminders(self.db, batch_limit=1)
        third = process_due_task_reminders(self.db, batch_limit=1)
        self.assertEqual((first.created, second.created, third.created), (2, 2, 0))
        self.assertEqual((first.scanned, second.scanned, third.scanned), (1, 1, 0))

    def test_busy_delivery_lock_does_not_send_or_mark_pending_reminders(self):
        task = self.make_due()
        with reminder_delivery_lock(self.db) as acquired:
            self.assertTrue(acquired)
            result = process_due_task_reminders(self.db)
        self.assertEqual(result.created, 0)
        self.assertFalse(task.reminder_sent)
        self.assertEqual(process_due_task_reminders(self.db).created, 2)

    def test_elapsed_budget_preserves_pending_reminders(self):
        task = self.make_due()
        with patch("app.services.notification_service.monotonic", side_effect=[0, 2]):
            result = process_due_task_reminders(self.db, max_duration_seconds=1)
        self.assertEqual(result.scanned, 0)
        self.assertFalse(task.reminder_sent)
        self.assertEqual(self.db.query(Notification).count(), 0)

    def test_completed_archived_and_departed_users_do_not_receive_reminders(self):
        completed = self.make_due()
        completed.status = TaskStatus.DONE.value
        archived = self.make_due()
        archived.archived_at = datetime.now(timezone.utc)
        orphan = self.make_due(creator_id=self.outsider.id)
        self.db.commit()
        result = process_due_task_reminders(self.db)
        self.assertEqual(result.created, 0)
        self.assertTrue(orphan.reminder_sent)


class PostgreSQLDeliveryLockTest(unittest.TestCase):
    def test_lock_uses_a_separate_transaction_and_closes_on_exception(self):
        db = MagicMock()
        bind = db.get_bind.return_value
        bind.dialect.name = "postgresql"
        connection = bind.engine.connect.return_value.__enter__.return_value
        connection.scalar.return_value = True
        with self.assertRaises(RuntimeError):
            with reminder_delivery_lock(db) as acquired:
                self.assertTrue(acquired)
                raise RuntimeError("isolated failure")
        self.assertIn("pg_try_advisory_xact_lock", str(connection.scalar.call_args.args[0]))
        bind.engine.connect.return_value.__exit__.assert_called_once()
        db.commit.assert_not_called()


class SchedulerClientTest(unittest.TestCase):
    def test_only_aggregate_fields_are_logged_and_origin_is_fixed(self):
        client = MagicMock()
        payload = {field: 0 for field in RESULT_FIELDS}
        payload["unexpected_private_data"] = "never logged"
        health = MagicMock(status=200)
        delivery = MagicMock()
        delivery.read.return_value = json.dumps(payload).encode()
        client.open.side_effect = [MagicMock(__enter__=MagicMock(return_value=health)),
                                   MagicMock(__enter__=MagicMock(return_value=delivery))]
        result = run_scheduler(TOKEN, opener=client)
        self.assertNotIn("unexpected_private_data", result)
        health_request = client.open.call_args_list[0].args[0]
        process_request = client.open.call_args_list[1].args[0]
        self.assertEqual(health_request.full_url, f"{API_ORIGIN}/health/ready")
        self.assertNotIn("Authorization", health_request.headers)
        self.assertEqual(process_request.full_url, f"{API_ORIGIN}/api/notifications/reminders/scheduled")
        self.assertEqual(process_request.get_method(), "POST")

    def test_redirects_cannot_forward_the_credential(self):
        self.assertIsNone(NoRedirects().redirect_request(None, None, 302, "", {}, "https://other.example"))

    def test_errors_do_not_print_secrets_or_provider_responses(self):
        with patch.dict("os.environ", {"REMINDER_SCHEDULER_TOKEN": TOKEN}), \
             patch("reminder_scheduler.run_scheduler", side_effect=HTTPError("https://api.example", 503,
                                                                           TOKEN, {}, None)), \
             patch("sys.stderr", new_callable=io.StringIO) as output:
            self.assertEqual(main(), 1)
        self.assertIn("503", output.getvalue())
        self.assertNotIn(TOKEN, output.getvalue())


if __name__ == "__main__":
    unittest.main()
