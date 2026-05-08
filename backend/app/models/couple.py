from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import relationship

from app.database.base import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import GoalStatus


class CoupleGoal(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "couple_goals"

    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(160), nullable=False)
    description = Column(Text, nullable=True)
    target_date = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(24), default=GoalStatus.ACTIVE.value, nullable=False)
    created_by_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    family = relationship("Family", back_populates="goals")
    created_by = relationship("User")


class DateIdea(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "date_ideas"

    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(160), nullable=False)
    description = Column(Text, nullable=True)
    suggested_date = Column(DateTime(timezone=True), nullable=True)
    mood = Column(String(60), default="romântico", nullable=False)
    is_done = Column(Boolean, default=False, nullable=False)
    created_by_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    family = relationship("Family", back_populates="date_ideas")
    created_by = relationship("User")


class QuickNote(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "quick_notes"

    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False)
    message = Column(Text, nullable=False)
    created_by_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    family = relationship("Family", back_populates="notes")
    created_by = relationship("User")

