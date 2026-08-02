from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, String, UniqueConstraint, text
from sqlalchemy.orm import relationship

from app.database.base import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class GoogleCalendarConnection(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "google_calendar_connections"
    __table_args__ = (
        UniqueConstraint("family_id", "user_id", name="uq_google_calendar_connection_family_user"),
        Index("ix_google_calendar_connections_family_id", "family_id"),
        Index("ix_google_calendar_connections_user_id", "user_id"),
        Index(
            "ix_google_calendar_connections_family_user_unique",
            "family_id",
            "user_id",
            unique=True,
            sqlite_where=text("user_id IS NOT NULL"),
            postgresql_where=text("user_id IS NOT NULL"),
        ),
    )

    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    calendar_id = Column(String(255), nullable=True)
    is_connected = Column(Boolean, default=False, nullable=False)
    access_token_encrypted = Column(String(4000), nullable=True)
    refresh_token_encrypted = Column(String(4000), nullable=True)
    access_token_expires_at = Column(DateTime(timezone=True), nullable=True)
    token_scope = Column(String(1000), nullable=True)
    token_type = Column(String(40), nullable=True)
    connected_at = Column(DateTime(timezone=True), nullable=True)
    disconnected_at = Column(DateTime(timezone=True), nullable=True)

    family = relationship("Family")
    user = relationship("User")


class GoogleCalendarUserConnection(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "google_calendar_user_connections"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_google_calendar_user_connection_user"),
        Index("ix_google_calendar_user_connections_user_unique", "user_id", unique=True),
    )

    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    is_connected = Column(Boolean, default=False, nullable=False)
    access_token_encrypted = Column(String(4000), nullable=True)
    refresh_token_encrypted = Column(String(4000), nullable=True)
    access_token_expires_at = Column(DateTime(timezone=True), nullable=True)
    token_scope = Column(String(1000), nullable=True)
    token_type = Column(String(40), nullable=True)
    connected_at = Column(DateTime(timezone=True), nullable=True)
    disconnected_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User")


class GoogleCalendarFamilySettings(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "google_calendar_family_settings"
    __table_args__ = (
        UniqueConstraint("family_id", "user_id", name="uq_google_calendar_family_settings"),
        Index("ix_google_calendar_family_settings_family_id", "family_id"),
        Index("ix_google_calendar_family_settings_user_id", "user_id"),
        Index(
            "ix_google_calendar_family_settings_family_user_unique",
            "family_id",
            "user_id",
            unique=True,
        ),
    )

    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    mode = Column(String(32), default="primary", nullable=False)
    google_calendar_id = Column(String(255), nullable=True)
    google_calendar_name = Column(String(180), nullable=True)

    family = relationship("Family")
    user = relationship("User")
