from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database.base import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import TaskPriority, TaskStatus


class Task(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "tasks"

    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(180), nullable=False)
    description = Column(Text, nullable=True)
    assignee_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    creator_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    category_id = Column(String(36), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    due_date = Column(DateTime(timezone=True), nullable=True)
    priority = Column(String(16), default=TaskPriority.MEDIUM.value, nullable=False)
    status = Column(String(24), default=TaskStatus.PENDING.value, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    points_awarded = Column(Integer, default=0, nullable=False)

    family = relationship("Family", back_populates="tasks")
    assignee = relationship("User", back_populates="assigned_tasks", foreign_keys=[assignee_id])
    creator = relationship("User", back_populates="created_tasks", foreign_keys=[creator_id])
    category = relationship("Category", back_populates="tasks")

