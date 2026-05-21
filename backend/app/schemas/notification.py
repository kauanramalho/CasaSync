from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class NotificationRead(ORMModel):
    id: str
    family_id: str
    user_id: str
    task_id: str | None = None
    type: str
    title: str
    description: str | None = None
    read: bool
    created_at: datetime
    read_at: datetime | None = None


class NotificationPreferencesUpdate(BaseModel):
    email_task_reminders_enabled: bool | None = None
    push_task_reminders_enabled: bool | None = None


class NotificationSettingsRead(BaseModel):
    email_feature_enabled: bool
    email_configured: bool
    email_task_reminders_enabled: bool
    push_feature_enabled: bool
    push_configured: bool
    push_task_reminders_enabled: bool
    vapid_public_key: str | None = None
    browser_push_supported: bool = True


class WebPushKeys(BaseModel):
    p256dh: str = Field(min_length=20, max_length=500)
    auth: str = Field(min_length=10, max_length=500)


class WebPushSubscriptionIn(BaseModel):
    endpoint: str = Field(min_length=20, max_length=2000)
    keys: WebPushKeys


class WebPushSubscriptionStatus(BaseModel):
    enabled: bool
    message: str


class ReminderProcessResult(BaseModel):
    scanned: int = 0
    created: int = 0
    skipped: int = 0
    email_sent: int = 0
    email_skipped: int = 0
    email_failed: int = 0
    push_sent: int = 0
    push_skipped: int = 0
    push_failed: int = 0
