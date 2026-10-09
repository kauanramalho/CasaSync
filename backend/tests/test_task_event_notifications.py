import json
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi import BackgroundTasks

from app.core.config import Settings
from app.models import FamilyMember, Notification, WebPushSubscription
from app.models.image_asset import ImageAsset
from app.schemas.task import TaskCreate, TaskUpdate
from app.services.notification_service import (
    _creator_avatar, _deliver_pending_task_push, clear_user_notifications,
    create_task_created_notifications, deliver_task_events_in_background,
    list_user_notifications, process_due_task_reminders,
)
from app.services.reminder_lock import reminder_delivery_lock
from app.services.task_service import complete_task, create_task, update_task
from tests import test_notifications as notification_fixtures


class TaskEventNotificationTest(unittest.TestCase):
    tearDown = notification_fixtures.NotificationFlowTest.tearDown

    def setUp(self):
        notification_fixtures.NotificationFlowTest.setUp(self)
        self.creator.push_task_reminders_enabled = True
        self.assignee.push_task_reminders_enabled = True
        self.db.add_all([WebPushSubscription(user_id=user.id, family_id=self.family.id,
            endpoint=f"https://fcm.googleapis.com/fcm/send/synthetic-{user.id}",
            p256dh="p" * 24, auth="a" * 16, is_active=True) for user in [self.creator, self.assignee]])
        self.db.commit()
        self.flags = patch("app.services.notification_service.get_settings", return_value=Settings(
            _env_file=None, web_push_enabled=True, vapid_private_key="isolated-private-key",
            vapid_public_key="isolated-public-key", vapid_subject="https://casa-sync.vercel.app"))
        self.sender_patch = patch("app.services.notification_service._send_push_to_subscriptions", return_value="sent")
        self.flags.start()
        self.sender = self.sender_patch.start()
        self.addCleanup(self.flags.stop)
        self.addCleanup(self.sender_patch.stop)

    def task(self, **extra):
        return create_task(self.db, self.family.id, self.creator.id,
                           TaskCreate(title="Synthetic family task", **extra))

    def test_creation_is_persisted_without_io_then_delivered_once_to_both(self):
        task = self.task(assignee_ids=[self.creator.id])
        self.sender.assert_not_called()
        rows = self.db.query(Notification).filter_by(type="task_created").all()
        self.assertEqual({n.user_id for n in rows}, {self.creator.id, self.assignee.id})
        self.assertTrue(all(n.push_status == "pending" for n in rows))
        self.assertEqual(create_task_created_notifications(self.db, task=task), 0)
        self.assertEqual(_deliver_pending_task_push(self.db).push_sent, 2)
        self.assertEqual(_deliver_pending_task_push(self.db).push_sent, 0)
        self.assertEqual(self.sender.call_count, 2)
        payload = json.loads(self.sender.call_args.kwargs["data"])
        self.assertIn("Kauan criou", payload["title"])
        self.assertIn(task.title, payload["body"])
        self.assertIn("Prioridade", payload["body"])

    def test_both_are_notified_when_bia_creates_her_own_task(self):
        task = create_task(self.db, self.family.id, self.assignee.id,
                           TaskCreate(title="Synthetic Bia task", assignee_ids=[self.assignee.id]))
        self.assertEqual(_deliver_pending_task_push(self.db).push_sent, 2)
        self.assertTrue(all("Bia criou" in json.loads(c.kwargs["data"])["title"] for c in self.sender.call_args_list))
        self.assertEqual(len(list_user_notifications(self.db, family_id=self.family.id, user_id=self.creator.id)), 1)
        self.assertEqual(task.creator_id, self.assignee.id)

    def test_opt_out_departure_disabled_and_completed_skip_push(self):
        task = self.task()
        self.assignee.push_task_reminders_enabled = False
        self.db.commit()
        self.assertEqual(_deliver_pending_task_push(self.db).push_sent, 1)
        self.task()
        self.db.query(FamilyMember).filter_by(user_id=self.assignee.id).delete()
        self.db.commit()
        self.assertEqual(_deliver_pending_task_push(self.db).push_sent, 1)
        task = self.task()
        complete_task(self.db, self.family.id, task.id)
        self.assertEqual(_deliver_pending_task_push(self.db).push_sent, 0)
        self.task()
        with patch("app.services.notification_service.get_settings", return_value=Settings(_env_file=None)):
            self.assertEqual(_deliver_pending_task_push(self.db).push_sent, 0)

    def test_inactive_member_and_other_family_never_receive_creation(self):
        self.assignee.is_active = False
        self.db.commit()
        self.task()
        self.assertEqual({n.user_id for n in self.db.query(Notification).all()}, {self.creator.id})

    def test_retry_is_bounded_delayed_and_keeps_same_tag(self):
        self.assignee.push_task_reminders_enabled = False
        self.db.commit()
        self.task()
        self.sender.return_value = "failed"
        self.assertEqual(_deliver_pending_task_push(self.db).push_failed, 1)
        self.assertEqual(_deliver_pending_task_push(self.db).push_failed, 0)
        first_tag = json.loads(self.sender.call_args.kwargs["data"])["tag"]
        row = self.db.query(Notification).filter_by(push_status="retry").one()
        row.updated_at = datetime.now(timezone.utc) - timedelta(minutes=2)
        self.db.commit()
        self.assertEqual(_deliver_pending_task_push(self.db).push_failed, 1)
        self.assertEqual(json.loads(self.sender.call_args.kwargs["data"])["tag"], first_tag)
        self.assertEqual(_deliver_pending_task_push(self.db).push_failed, 0)
        self.assertEqual(row.push_status, "failed")

    def test_deadline_without_reminder_once_and_clear_does_not_resend(self):
        reference = datetime.now(timezone.utc)
        task = self.task(due_date=reference + timedelta(minutes=1))
        _deliver_pending_task_push(self.db)
        first = process_due_task_reminders(self.db, now=reference + timedelta(minutes=2))
        self.assertEqual((first.created, first.push_sent), (2, 2))
        self.assertEqual(process_due_task_reminders(self.db, now=reference + timedelta(minutes=3)).created, 0)
        clear_user_notifications(self.db, family_id=self.family.id, user_id=self.creator.id)
        clear_user_notifications(self.db, family_id=self.family.id, user_id=self.assignee.id)
        self.assertEqual(list_user_notifications(self.db, family_id=self.family.id, user_id=self.creator.id), [])
        self.assertEqual(process_due_task_reminders(self.db, now=reference + timedelta(minutes=4)).created, 0)
        self.assertTrue(self.db.query(Notification).filter_by(task_id=task.id, type="overdue").first())

    def test_multiple_configured_reminders_include_unassigned_member(self):
        reference = datetime.now(timezone.utc)
        task = self.task(assignee_ids=[self.creator.id], due_date=reference + timedelta(hours=1),
                         reminders=[{"value": 30, "unit": "minutes"}, {"value": 15, "unit": "minutes"}])
        _deliver_pending_task_push(self.db)
        with patch("app.services.notification_service.send_task_reminder_push", return_value="sent") as sender:
            one = process_due_task_reminders(self.db, now=reference + timedelta(minutes=31))
            two = process_due_task_reminders(self.db, now=reference + timedelta(minutes=46))
            again = process_due_task_reminders(self.db, now=reference + timedelta(minutes=47))
        self.assertEqual((one.created, two.created, again.created), (2, 2, 0))
        self.assertEqual(sender.call_count, 4)
        self.assertEqual({c.kwargs["user_id"] for c in sender.call_args_list}, {self.creator.id, self.assignee.id})
        self.assertEqual(self.db.query(Notification).filter_by(task_id=task.id, type="reminder").count(), 4)

    def test_completed_archived_and_old_deadlines_do_not_generate_alerts(self):
        reference = datetime.now(timezone.utc)
        done = self.task(due_date=reference - timedelta(minutes=1), status="concluida")
        archived = self.task(due_date=reference - timedelta(minutes=1))
        archived.archived_at = reference
        old = self.task(due_date=reference - timedelta(days=2))
        self.db.commit()
        self.assertEqual(process_due_task_reminders(self.db, now=reference).created, 0)
        self.assertFalse(self.db.query(Notification).filter_by(task_id=done.id).first())
        self.assertFalse(self.db.query(Notification).filter_by(type="overdue").first())
        self.assertIsNotNone(old.id)

    def test_future_reminders_are_not_sent_early(self):
        reference = datetime.now(timezone.utc)
        task = self.task(due_date=reference + timedelta(hours=2), reminders=[{"value": 1, "unit": "hours"}])
        _deliver_pending_task_push(self.db)
        self.assertEqual(process_due_task_reminders(self.db, now=reference).created, 0)
        self.assertFalse(task.reminders[0].sent)

    def test_rescheduling_cancels_an_old_pending_deadline(self):
        reference = datetime.now(timezone.utc)
        task = self.task(due_date=reference - timedelta(minutes=1))
        _deliver_pending_task_push(self.db)
        self.sender.return_value = "failed"
        process_due_task_reminders(self.db, now=reference)
        rows = self.db.query(Notification).filter_by(type="overdue").all()
        for row in rows:
            row.updated_at = reference - timedelta(minutes=2)
        self.db.commit()
        update_task(self.db, self.family.id, task.id, TaskUpdate(due_date=reference + timedelta(hours=1)))
        self.sender.reset_mock()
        _deliver_pending_task_push(self.db)
        self.sender.assert_not_called()
        self.assertTrue(all(row.push_status == "skipped" for row in rows))

    def test_failed_reminder_retries_once_without_duplicate_inbox_or_tag(self):
        reference = datetime.now(timezone.utc)
        task = self.task(due_date=reference + timedelta(hours=2), reminders=[{"value": 1, "unit": "hours"}])
        _deliver_pending_task_push(self.db)
        self.sender.reset_mock()
        self.sender.return_value = "failed"
        process_due_task_reminders(self.db, now=reference + timedelta(hours=1, minutes=1))
        tags = {json.loads(c.kwargs["data"])["tag"] for c in self.sender.call_args_list}
        self.assertEqual(len(tags), 2)
        rows = self.db.query(Notification).filter_by(type="reminder").all()
        for row in rows:
            row.updated_at = reference - timedelta(minutes=2)
        self.db.commit()
        self.sender.reset_mock()
        self.sender.return_value = "sent"
        self.assertEqual(_deliver_pending_task_push(self.db).push_sent, 2)
        self.assertEqual({json.loads(c.kwargs["data"])["tag"] for c in self.sender.call_args_list}, tags)
        self.assertEqual(self.db.query(Notification).filter_by(task_id=task.id, type="reminder").count(), 2)

    def test_unicode_details_stay_inside_web_push_payload_budget(self):
        self.creator.name = "😀" * 120
        self.assignee.name = "😀" * 120
        self.db.commit()
        task = create_task(self.db, self.family.id, self.creator.id,
                           TaskCreate(title="😀" * 180, assignee_ids=[self.creator.id, self.assignee.id]))
        _deliver_pending_task_push(self.db)
        for call in self.sender.call_args_list:
            self.assertLess(len(call.kwargs["data"].encode("utf-8")), 3500)
        self.assertIsNotNone(task.id)

    def test_avatar_only_owned_public_upload_no_third_party_or_credentials(self):
        task = self.task()
        image_id = "a1234567-1234-1234-1234-123456789abc"
        self.db.add(ImageAsset(id=image_id, owner_user_id=self.creator.id, scope="avatar", content_type="image/png",
                               byte_size=8, content=b"synthetic"))
        url = f"https://casasync-api.onrender.com/api/uploads/images/{image_id}"
        for unsafe in ["https://tracker.example/avatar.png", "data:image/png;base64,a", url + "?token=no", url.replace("https://", "http://"),
                       url.replace("casasync-api", "user:password@casasync-api")]:
            self.creator.avatar_url = unsafe
            self.db.commit()
            self.assertIsNone(_creator_avatar(self.db, task))
        self.creator.avatar_url = url
        self.db.commit()
        self.assertEqual(_creator_avatar(self.db, task), url)
        _deliver_pending_task_push(self.db)
        self.assertEqual(json.loads(self.sender.call_args.kwargs["data"])["avatarUrl"], url)
        rows = list_user_notifications(self.db, family_id=self.family.id, user_id=self.assignee.id)
        self.assertEqual(rows[0].creator_avatar_url, url)
        self.db.query(ImageAsset).filter_by(id=image_id).update({"owner_user_id": self.outsider.id})
        self.db.commit()
        self.assertIsNone(_creator_avatar(self.db, task))

    def test_background_uses_fresh_session_and_respects_lock(self):
        self.task()
        with patch("app.database.session.SessionLocal", return_value=self.SessionLocal()):
            deliver_task_events_in_background(self.family.id)
        self.assertEqual(self.sender.call_count, 2)
        self.task()
        with reminder_delivery_lock(self.db), patch("app.database.session.SessionLocal", return_value=self.SessionLocal()):
            deliver_task_events_in_background(self.family.id)
        self.assertEqual(self.sender.call_count, 2)

    def test_manual_create_route_registers_background_delivery(self):
        from app.routes.tasks import create
        background = BackgroundTasks()
        task = create(TaskCreate(title="Synthetic route task"), background, self.creator, self.family.id, self.db)
        self.sender.assert_not_called()
        self.assertEqual(len(background.tasks), 1)
        self.assertEqual(background.tasks[0].args, (self.family.id,))
        self.assertEqual(task.creator_id, self.creator.id)


if __name__ == "__main__":
    unittest.main()
