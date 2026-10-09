import unittest
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

from app.core.config import Settings
from app.schemas.notification import WebPushSubscriptionIn
from app.services.notification_service import is_device_push_subscription_active, save_web_push_subscription, send_task_reminder_push
from tests import test_notifications as notification_fixtures


def push_payload(endpoint="https://fcm.googleapis.com/fcm/send/test-device"):
    return WebPushSubscriptionIn(endpoint=endpoint, keys={"p256dh": "p" * 24, "auth": "a" * 16})


class PushEndpointValidationTest(unittest.TestCase):
    def test_supported_browser_push_providers(self):
        for endpoint in (
            "https://fcm.googleapis.com/fcm/send/test",
            "https://updates.push.services.mozilla.com/wpush/v2/test",
            "https://web.push.apple.com/test-device",
            "https://wns2-db5p.notify.windows.com/test-device",
        ):
            with self.subTest(endpoint=endpoint):
                self.assertEqual(push_payload(endpoint).endpoint, endpoint)

    def test_arbitrary_internal_and_deceptive_destinations_are_rejected(self):
        for endpoint in (
            "http://fcm.googleapis.com/fcm/send/test",
            "https://127.0.0.1/internal",
            "https://[::1]/internal",
            "https://169.254.169.254/latest/meta-data",
            "https://attacker.example/push",
            "https://fcm.googleapis.com.attacker.example/push",
            "https://evilpush.services.mozilla.com/push",
            "https://user:password@fcm.googleapis.com/push",
            "https://fcm.googleapis.com:8443/push",
            "https://fcm.googleapis.com/push#fragment",
            "https://fcm.googleapis.com/",
            "file:///tmp/private-file",
        ):
            with self.subTest(endpoint=endpoint), self.assertRaises(ValidationError):
                push_payload(endpoint)


class PushSubscriptionOwnershipTest(unittest.TestCase):
    # Reuse the same isolated database setup without rerunning inherited tests.
    setUp = notification_fixtures.NotificationFlowTest.setUp
    tearDown = notification_fixtures.NotificationFlowTest.tearDown

    def test_subscription_cannot_be_taken_over_by_another_account(self):
        payload = push_payload()
        save_web_push_subscription(self.db, family_id=self.family.id, user_id=self.creator.id, payload=payload)
        with self.assertRaises(HTTPException) as raised:
            save_web_push_subscription(self.db, family_id=self.family.id, user_id=self.assignee.id, payload=payload)
        self.assertEqual(raised.exception.status_code, 409)

    def test_owner_can_refresh_existing_subscription(self):
        payload = push_payload()
        first = save_web_push_subscription(self.db, family_id=self.family.id, user_id=self.creator.id, payload=payload)
        second = save_web_push_subscription(self.db, family_id=self.family.id, user_id=self.creator.id, payload=payload)
        self.assertEqual(first.id, second.id)

    def test_device_confirmation_checks_account_family_keys_and_active_state(self):
        from app.models import FamilyMember

        payload = push_payload()
        check = lambda user_id, family_id, value=payload: is_device_push_subscription_active(
            self.db, user_id=user_id, family_id=family_id, payload=value)
        self.assertFalse(check(self.creator.id, self.family.id))
        row = save_web_push_subscription(self.db, family_id=self.family.id, user_id=self.creator.id, payload=payload)
        self.assertTrue(check(self.creator.id, self.family.id))
        self.assertFalse(check(self.assignee.id, self.family.id))
        changed_keys = WebPushSubscriptionIn(endpoint=payload.endpoint, keys={"p256dh": "x" * 24, "auth": "a" * 16})
        self.assertFalse(check(self.creator.id, self.family.id, changed_keys))
        self.db.add(FamilyMember(id="creator-other", family_id=self.other_family.id, user_id=self.creator.id, role="member"))
        self.db.commit()
        self.assertFalse(check(self.creator.id, self.other_family.id))
        row.is_active = False
        self.db.commit()
        self.assertFalse(check(self.creator.id, self.family.id))

    def test_device_status_does_not_expose_or_enable_another_subscription(self):
        from app.routes.notifications import device_push_status

        payload = push_payload()
        row = save_web_push_subscription(self.db, family_id=self.family.id, user_id=self.creator.id, payload=payload)
        settings = Settings(_env_file=None, web_push_enabled=True, vapid_public_key="public",
                            vapid_private_key="private", vapid_subject="mailto:test@example.com")
        with patch("app.routes.notifications.get_settings", return_value=settings):
            self.creator.push_task_reminders_enabled = False
            self.assertFalse(device_push_status(payload, self.creator, self.family.id, self.db).enabled)
            self.creator.push_task_reminders_enabled = True
            result = device_push_status(payload, self.creator, self.family.id, self.db)
            self.assertTrue(result.enabled)
            self.assertNotIn(payload.endpoint, result.model_dump_json())
            self.assignee.push_task_reminders_enabled = True
            self.assertFalse(device_push_status(payload, self.assignee, self.family.id, self.db).enabled)
        self.assertEqual(row.user_id, self.creator.id)

    def test_legacy_arbitrary_destination_is_never_contacted(self):
        from app.models import Task, WebPushSubscription

        self.db.add(WebPushSubscription(family_id=self.family.id, user_id=self.creator.id,
                                       endpoint="https://127.0.0.1/internal", p256dh="p" * 24, auth="a" * 16))
        self.db.commit()
        settings = Settings(_env_file=None, web_push_enabled=True, vapid_public_key="test-public",
                            vapid_private_key="test-private", vapid_subject="mailto:test@example.com")
        with patch("app.services.notification_service.get_settings", return_value=settings), patch("pywebpush.webpush") as sender:
            result = send_task_reminder_push(self.db, user_id=self.creator.id, family_id=self.family.id,
                                            task=Task(id="test-task", title="Teste", family_id=self.family.id))
        sender.assert_not_called()
        self.assertEqual(result, "failed")

    def test_push_has_a_bounded_network_timeout(self):
        from app.models import Task

        save_web_push_subscription(self.db, family_id=self.family.id, user_id=self.creator.id, payload=push_payload())
        settings = Settings(_env_file=None, web_push_enabled=True, vapid_public_key="test-public",
                            vapid_private_key="test-private", vapid_subject="mailto:test@example.com")
        with patch("app.services.notification_service.get_settings", return_value=settings), patch("pywebpush.webpush") as sender:
            result = send_task_reminder_push(self.db, user_id=self.creator.id, family_id=self.family.id,
                                            task=Task(id="test-task", title="Teste", family_id=self.family.id))
        self.assertEqual(result, "sent")
        self.assertEqual(sender.call_args.kwargs["timeout"], 20)
