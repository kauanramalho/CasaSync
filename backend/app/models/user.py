from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text, func, text
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
    ai_task_import_instructions = Column(Text, nullable=True)
    active_family_id = Column(
        String(36),
        ForeignKey("families.id", ondelete="SET NULL", use_alter=True, name="fk_users_active_family_id"),
        nullable=True,
        index=True,
    )
    __table_args__ = (
        Index(
            "ix_users_username_unique",
            "username",
            unique=True,
            sqlite_where=text("username IS NOT NULL"),
            postgresql_where=text("username IS NOT NULL"),
        ),
        Index(
            "ix_users_username_lower_unique",
            func.lower(username),
            unique=True,
            sqlite_where=text("username IS NOT NULL"),
            postgresql_where=text("username IS NOT NULL"),
        ),
    )

    memberships = relationship("FamilyMember", back_populates="user", cascade="all, delete-orphan")
    active_family = relationship("Family", foreign_keys=[active_family_id])
    created_tasks = relationship("Task", back_populates="creator", foreign_keys="Task.creator_id")
    assigned_tasks = relationship("Task", back_populates="assignee", foreign_keys="Task.assignee_id")
    task_assignment_links = relationship("TaskAssignee", back_populates="user", cascade="all, delete-orphan")
    task_attachments = relationship("TaskAttachment", back_populates="uploaded_by", foreign_keys="TaskAttachment.uploaded_by_id")
