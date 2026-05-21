from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text, UniqueConstraint

from app.database.base import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class Notification(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "notifications"
    __table_args__ = (UniqueConstraint("dedupe_key", name="uq_notifications_dedupe_key"),)

    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    task_id = Column(String(36), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True, index=True)
    type = Column(String(40), default="info", nullable=False)
    title = Column(String(180), nullable=False)
    description = Column(Text, nullable=True)
    dedupe_key = Column(String(255), nullable=False, unique=True, index=True)
    read = Column(Boolean, default=False, nullable=False)
    read_at = Column(DateTime(timezone=True), nullable=True)
    email_status = Column(String(24), default="not_requested", nullable=False)
    email_sent_at = Column(DateTime(timezone=True), nullable=True)
    push_status = Column(String(24), default="not_requested", nullable=False)
    push_sent_at = Column(DateTime(timezone=True), nullable=True)


class WebPushSubscription(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "web_push_subscriptions"
    __table_args__ = (UniqueConstraint("endpoint", name="uq_web_push_subscriptions_endpoint"),)

    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    endpoint = Column(Text, nullable=False)
    p256dh = Column(Text, nullable=False)
    auth = Column(Text, nullable=False)
    user_agent = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    last_seen_at = Column(DateTime(timezone=True), nullable=True)
