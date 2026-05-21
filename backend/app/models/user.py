from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database.base import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "users"

    name = Column(String(120), nullable=False)
    username = Column(String(30), unique=True, index=True, nullable=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    avatar_url = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    token_version = Column(Integer, default=0, nullable=False)
    email_verified = Column(Boolean, default=True, nullable=False)
    email_verified_at = Column(DateTime(timezone=True), nullable=True)
    two_factor_enabled = Column(Boolean, default=True, nullable=False)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    last_2fa_verified_at = Column(DateTime(timezone=True), nullable=True)
    email_task_reminders_enabled = Column(Boolean, default=False, nullable=False)
    push_task_reminders_enabled = Column(Boolean, default=False, nullable=False)

    memberships = relationship("FamilyMember", back_populates="user", cascade="all, delete-orphan")
    created_tasks = relationship("Task", back_populates="creator", foreign_keys="Task.creator_id")
    assigned_tasks = relationship("Task", back_populates="assignee", foreign_keys="Task.assignee_id")
    task_assignment_links = relationship("TaskAssignee", back_populates="user", cascade="all, delete-orphan")
    task_attachments = relationship("TaskAttachment", back_populates="uploaded_by", foreign_keys="TaskAttachment.uploaded_by_id")
