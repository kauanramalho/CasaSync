from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import relationship

from app.database.base import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin, utcnow


class TwoFactorCode(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "two_factor_codes"
    __table_args__ = (
        Index("ix_two_factor_codes_user_purpose", "user_id", "purpose"),
        Index("ix_two_factor_codes_expires_at", "expires_at"),
    )

    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    purpose = Column(String(24), nullable=False)
    code_hash = Column(String(128), nullable=False)
    salt = Column(String(64), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    consumed_at = Column(DateTime(timezone=True), nullable=True)
    attempts = Column(Integer, default=0, nullable=False)
    max_attempts = Column(Integer, default=5, nullable=False)
    delivery_channel = Column(String(24), default="email", nullable=False)
    last_sent_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User")
