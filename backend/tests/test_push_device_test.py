import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pywebpush import WebPushException

from app.core.config import Settings
from app.core import rate_limit
from app.models import FamilyMember, Notification, Task
from app.routes.notifications import router
from app.services.notification_service import save_web_push_subscription, send_device_test_push
from tests import test_notifications as notification_fixtures
from tests.test_push_security import push_payload


class DevicePushTest(unittest.TestCase):
    tearDown = notification_fixtures.NotificationFlowTest.tearDown

    def setUp(self):
        notification_fixtures.NotificationFlowTest.setUp(self)
        self.creator.push_task_reminders_enabled = True
        self.assignee.push_task_reminders_enabled = True
        self.db.commit()
        # Only fixture account buckets; never reset other tests' limits.
        for user in (self.creator, self.assignee, self.outsider):
            rate_limit._BUCKETS.pop(f"push-test:{user.id}", None)
        self.settings = Settings(_env_file=None, web_push_enabled=True, vapid_public_key="test-public",
                                 vapid_private_key="test-private", vapid_subject="https://example.com")
        self.addCleanup(patch.stopall)
        patch("app.services.notification_service.get_settings", return_value=self.settings).start()
        self.sender = patch("pywebpush.webpush").start()

    def register(self, user=None, endpoint="https://fcm.googleapis.com/fcm/send/test-device"):
        payload = push_payload(endpoint)
        row = save_web_push_subscription(self.db, family_id=self.family.id,
                                        user_id=(user or self.creator).id, payload=payload)
        return payload, row

    def send(self, payload, user=None, family_id=None):
        return send_device_test_push(self.db, user=user or self.creator,
                                     family_id=family_id or self.family.id, payload=payload)

    def test_sends_only_exact_device_without_creating_records(self):
        payload, _ = self.register()
        self.register(endpoint="https://fcm.googleapis.com/fcm/send/other-own-device")
        self.register(user=self.assignee, endpoint="https://web.push.apple.com/other-member")
        result = self.send(payload)
        self.sender.assert_called_once()
        sent = self.sender.call_args.kwargs
        self.assertEqual(sent["subscription_info"], payload.model_dump())
        self.assertEqual(sent["ttl"], 300)
        self.assertEqual(sent["timeout"], 20)
        self.assertEqual(sent["headers"], {"Urgency": "high"})
        body = json.loads(sent["data"])
        self.assertEqual(body["url"], "/configuracoes")
        self.assertTrue(body["tag"].startswith("casasync-push-test-"))
        self.assertNotIn("taskId", body)
        self.assertEqual(self.db.query(Notification).count(), 0)
        self.assertEqual(self.db.query(Task).count(), 0)
        self.assertTrue(result.accepted)
        self.assertIn("nao confirma", result.message)
        self.assertNotIn(payload.endpoint, result.model_dump_json())

    def test_unregistered_device_is_rejected(self):
        with self.assertRaises(HTTPException) as raised:
            self.send(push_payload())
        self.assertEqual(raised.exception.status_code, 409)
        self.sender.assert_not_called()

    def test_other_account_subscription_is_rejected(self):
        payload, row = self.register()
        with self.assertRaises(HTTPException) as raised:
            self.send(payload, user=self.assignee)
        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(row.user_id, self.creator.id)
        self.sender.assert_not_called()

    def test_other_family_subscription_is_rejected_even_for_member(self):
        payload, _ = self.register()
        self.db.add(FamilyMember(id="creator-other", family_id=self.other_family.id,
                                user_id=self.creator.id, role="member"))
        self.db.commit()
        with self.assertRaises(HTTPException) as raised:
            self.send(payload, family_id=self.other_family.id)
        self.assertEqual(raised.exception.status_code, 409)
        self.sender.assert_not_called()

    def test_nonmember_cannot_send(self):
        payload, _ = self.register()
        with self.assertRaises(HTTPException) as raised:
            self.send(payload, user=self.outsider)
        self.assertIn(raised.exception.status_code, (403, 404))
        self.sender.assert_not_called()

    def test_mismatched_keys_and_inactive_registration_are_rejected(self):
        payload, row = self.register()
        for field, value in (("p256dh", "x" * 24), ("auth", "x" * 16)):
            changed = payload.model_copy(deep=True)
            setattr(changed.keys, field, value)
            with self.subTest(field=field), self.assertRaises(HTTPException) as raised:
                self.send(changed)
            self.assertEqual(raised.exception.status_code, 409)
        row.is_active = False
        self.db.commit()
        with self.assertRaises(HTTPException) as raised:
            self.send(payload)
        self.assertEqual(raised.exception.status_code, 409)
        self.sender.assert_not_called()

    def test_disabled_or_unconfigured_feature_never_sends(self):
        payload, _ = self.register()
        for settings in (Settings(_env_file=None), Settings(_env_file=None, web_push_enabled=True)):
            with self.subTest(configured=settings.web_push_configured), patch(
                "app.services.notification_service.get_settings", return_value=settings
            ), self.assertRaises(HTTPException) as raised:
                self.send(payload)
            self.assertEqual(raised.exception.status_code, 400)
        self.sender.assert_not_called()

    def test_user_optout_never_sends(self):
        payload, _ = self.register()
        self.creator.push_task_reminders_enabled = False
        with self.assertRaises(HTTPException) as raised:
            self.send(payload)
        self.assertEqual(raised.exception.status_code, 409)
        self.sender.assert_not_called()

    def test_rate_limit_covers_other_devices_and_families_for_same_account(self):
        first, _ = self.register()
        second, _ = self.register(endpoint="https://fcm.googleapis.com/fcm/send/second-device")
        self.send(first)
        with self.assertRaises(HTTPException) as raised:
            self.send(second)
        self.assertEqual(raised.exception.status_code, 429)
        self.sender.assert_called_once()

    def test_expired_provider_registration_is_persistently_disabled(self):
        payload, row = self.register()
        self.sender.side_effect = WebPushException("sensitive-provider-response", response=SimpleNamespace(status_code=410))
        with self.assertRaises(HTTPException) as raised:
            self.send(payload)
        self.assertEqual(raised.exception.status_code, 502)
        self.assertNotIn("sensitive", raised.exception.detail)
        self.db.expire_all()
        self.assertFalse(row.is_active)

    def test_provider_exception_is_safe_and_does_not_disable_valid_subscription(self):
        payload, row = self.register()
        self.sender.side_effect = RuntimeError("secret-provider-response")
        with self.assertLogs("app.services.notification_service", level="WARNING") as logged:
            with self.assertRaises(HTTPException) as raised:
                self.send(payload)
        self.assertEqual(raised.exception.status_code, 502)
        self.assertNotIn("secret-provider-response", raised.exception.detail)
        self.assertNotIn("secret-provider-response", "".join(logged.output))
        self.assertNotIn(payload.endpoint, "".join(logged.output))
        self.assertTrue(row.is_active)

    def test_failed_attempt_also_consumes_cooldown(self):
        payload, _ = self.register()
        self.sender.side_effect = RuntimeError("failure")
        with self.assertRaises(HTTPException):
            self.send(payload)
        with self.assertRaises(HTTPException) as raised:
            self.send(payload)
        self.assertEqual(raised.exception.status_code, 429)
        self.sender.assert_called_once()


class DevicePushRouteAuthTest(unittest.TestCase):
    def test_route_requires_user_authentication(self):
        app = FastAPI()
        app.include_router(router, prefix="/api")
        with TestClient(app) as client, patch("pywebpush.webpush") as sender:
            response = client.post("/api/notifications/push-subscriptions/test", json=push_payload().model_dump())
        self.assertEqual(response.status_code, 401)
        sender.assert_not_called()
