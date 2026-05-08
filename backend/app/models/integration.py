from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String
from sqlalchemy.orm import relationship

from app.database.base import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class GoogleCalendarConnection(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "google_calendar_connections"

    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), unique=True, nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    calendar_id = Column(String(255), nullable=True)
    is_connected = Column(Boolean, default=False, nullable=False)
    access_token_encrypted = Column(String(2000), nullable=True)
    refresh_token_encrypted = Column(String(2000), nullable=True)
    connected_at = Column(DateTime(timezone=True), nullable=True)

    family = relationship("Family")
    user = relationship("User")

