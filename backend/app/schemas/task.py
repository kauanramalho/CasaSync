from datetime import datetime

from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field

from app.models.enums import TaskPriority, TaskStatus
from app.schemas.category import CategoryRead
from app.schemas.common import ORMModel
from app.schemas.user import UserSummary


class TaskReminderInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    reminder_enabled: bool = Field(default=False, validation_alias=AliasChoices("reminder_enabled", "reminderEnabled"))
    reminder_value: int | None = Field(default=None, gt=0, validation_alias=AliasChoices("reminder_value", "reminderValue"))
    reminder_unit: Literal["minutes", "hours", "days"] | None = Field(default=None, validation_alias=AliasChoices("reminder_unit", "reminderUnit"))


class TaskCreate(TaskReminderInput):
    title: str = Field(min_length=2, max_length=180)
    description: str | None = Field(default=None, max_length=1200)
    assignee_id: str | None = None
    assignee_ids: list[str] | None = Field(default=None, max_length=20)
    category_id: str | None = None
    category_name: str | None = Field(default=None, max_length=80)
    due_date: datetime | None = None
    priority: TaskPriority = TaskPriority.MEDIUM
    status: TaskStatus = TaskStatus.PENDING


class TaskUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str | None = Field(default=None, min_length=2, max_length=180)
    description: str | None = Field(default=None, max_length=1200)
    assignee_id: str | None = None
    assignee_ids: list[str] | None = Field(default=None, max_length=20)
    category_id: str | None = None
    due_date: datetime | None = None
    priority: TaskPriority | None = None
    status: TaskStatus | None = None
    reminder_enabled: bool | None = Field(default=None, validation_alias=AliasChoices("reminder_enabled", "reminderEnabled"))
    reminder_value: int | None = Field(default=None, gt=0, validation_alias=AliasChoices("reminder_value", "reminderValue"))
    reminder_unit: Literal["minutes", "hours", "days"] | None = Field(default=None, validation_alias=AliasChoices("reminder_unit", "reminderUnit"))
    reminder_sent: bool | None = Field(default=None, validation_alias=AliasChoices("reminder_sent", "reminderSent"))


class TaskAssigneeAwardRead(BaseModel):
    user_id: str
    user: UserSummary
    points: int


class TaskRead(ORMModel):
    id: str
    family_id: str
    title: str
    description: str | None = None
    assignee_id: str | None = None
    creator_id: str | None = None
    category_id: str | None = None
    due_date: datetime | None = None
    priority: TaskPriority
    status: TaskStatus
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None
    archived_at: datetime | None = None
    points_awarded: int
    reminder_enabled: bool
    reminder_value: int | None = None
    reminder_unit: Literal["minutes", "hours", "days"] | None = None
    reminder_at: datetime | None = None
    reminder_sent: bool
    assignee: UserSummary | None = None
    assignee_ids: list[str] = []
    assignees: list[UserSummary] = []
    assignee_points: list[TaskAssigneeAwardRead] = []
    creator: UserSummary | None = None
    category: CategoryRead | None = None
