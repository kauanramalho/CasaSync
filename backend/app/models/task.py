from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database.base import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import TaskPriority, TaskStatus, TaskType


class TaskAssignee(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "task_assignees"
    __table_args__ = (UniqueConstraint("task_id", "user_id", name="uq_task_assignee"),)

    task_id = Column(String(36), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    points_awarded = Column(Integer, default=0, nullable=False)

    task = relationship("Task", back_populates="assignee_links")
    user = relationship("User", back_populates="task_assignment_links")


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
    task_type = Column(String(24), default=TaskType.TASK.value, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    archived_at = Column(DateTime(timezone=True), nullable=True)
    score_recorded_at = Column(DateTime(timezone=True), nullable=True)
    points_awarded = Column(Integer, default=0, nullable=False)
    reminder_enabled = Column(Boolean, default=False, nullable=False)
    reminder_value = Column(Integer, nullable=True)
    reminder_unit = Column(String(16), nullable=True)
    reminder_at = Column(DateTime(timezone=True), nullable=True)
    reminder_sent = Column(Boolean, default=False, nullable=False)
    automation_source = Column(String(80), nullable=True)
    automation_external_id = Column(String(160), nullable=True)
    automation_source_label = Column(String(180), nullable=True)
    automation_source_reference = Column(Text, nullable=True)
    recurrence_rule = Column(String(255), nullable=True)

    family = relationship("Family", back_populates="tasks")
    assignee = relationship("User", back_populates="assigned_tasks", foreign_keys=[assignee_id])
    creator = relationship("User", back_populates="created_tasks", foreign_keys=[creator_id])
    category = relationship("Category", back_populates="tasks")
    assignee_links = relationship("TaskAssignee", back_populates="task", cascade="all, delete-orphan")

    @property
    def assignees(self):
        linked_users = [link.user for link in self.assignee_links if link.user]
        if linked_users:
            return linked_users
        return [self.assignee] if self.assignee else []

    @property
    def assignee_ids(self):
        linked_ids = [link.user_id for link in self.assignee_links if link.user_id]
        if linked_ids:
            return linked_ids
        return [self.assignee_id] if self.assignee_id else []

    @property
    def assignee_points(self):
        if self.assignee_links:
            return [
                {
                    "user_id": link.user_id,
                    "user": link.user,
                    "points": link.points_awarded,
                }
                for link in self.assignee_links
                if link.user
            ]
        if self.assignee:
            return [
                {
                    "user_id": self.assignee_id,
                    "user": self.assignee,
                    "points": self.points_awarded,
                }
            ]
        return []
