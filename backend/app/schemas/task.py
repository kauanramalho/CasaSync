from datetime import datetime

from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field

from app.models.enums import TaskPriority, TaskStatus, TaskType
from app.schemas.category import CategoryRead
from app.schemas.common import ORMModel
from app.schemas.task_attachment import TaskAttachmentRead
from app.schemas.user import UserSummary


class TaskReminderInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    reminder_enabled: bool = Field(default=False, validation_alias=AliasChoices("reminder_enabled", "reminderEnabled"))
    reminder_value: int | None = Field(default=None, gt=0, validation_alias=AliasChoices("reminder_value", "reminderValue"))
    reminder_unit: Literal["minutes", "hours", "days"] | None = Field(default=None, validation_alias=AliasChoices("reminder_unit", "reminderUnit"))


class TaskReminderItemInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    value: int = Field(gt=0, le=365, validation_alias=AliasChoices("value", "reminder_value", "reminderValue", "amount"))
    unit: Literal["minutes", "hours", "days"] = Field(validation_alias=AliasChoices("unit", "reminder_unit", "reminderUnit"))


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
    task_type: TaskType = TaskType.TASK
    automation_source: str | None = Field(default=None, max_length=80)
    automation_external_id: str | None = Field(default=None, max_length=160)
    automation_source_label: str | None = Field(default=None, max_length=180)
    automation_source_reference: str | None = Field(default=None, max_length=1200)
    recurrence_rule: str | None = Field(default=None, max_length=255)
    reminders: list[TaskReminderItemInput] | None = Field(default=None, max_length=5)


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
    task_type: TaskType | None = None
    automation_source: str | None = Field(default=None, max_length=80)
    automation_external_id: str | None = Field(default=None, max_length=160)
    automation_source_label: str | None = Field(default=None, max_length=180)
    automation_source_reference: str | None = Field(default=None, max_length=1200)
    recurrence_rule: str | None = Field(default=None, max_length=255)
    reminder_enabled: bool | None = Field(default=None, validation_alias=AliasChoices("reminder_enabled", "reminderEnabled"))
    reminder_value: int | None = Field(default=None, gt=0, validation_alias=AliasChoices("reminder_value", "reminderValue"))
    reminder_unit: Literal["minutes", "hours", "days"] | None = Field(default=None, validation_alias=AliasChoices("reminder_unit", "reminderUnit"))
    reminder_sent: bool | None = Field(default=None, validation_alias=AliasChoices("reminder_sent", "reminderSent"))
    reminders: list[TaskReminderItemInput] | None = Field(default=None, max_length=5)


class TaskAssigneeAwardRead(BaseModel):
    user_id: str
    user: UserSummary
    points: int


class TaskReminderRead(ORMModel):
    id: str
    value: int
    unit: Literal["minutes", "hours", "days"]
    reminder_at: datetime
    sent: bool


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
    task_type: TaskType
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
    google_calendar_event_id: str | None = None
    google_calendar_synced_at: datetime | None = None
    google_calendar_synced_by_id: str | None = None
    automation_source: str | None = None
    automation_external_id: str | None = None
    automation_source_label: str | None = None
    automation_source_reference: str | None = None
    recurrence_rule: str | None = None
    assignee: UserSummary | None = None
    assignee_ids: list[str] = []
    assignees: list[UserSummary] = []
    assignee_points: list[TaskAssigneeAwardRead] = []
    creator: UserSummary | None = None
    category: CategoryRead | None = None
    attachments: list[TaskAttachmentRead] = []
    reminders: list[TaskReminderRead] = []
