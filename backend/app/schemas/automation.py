from datetime import date as Date
from datetime import time as Time
from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import TaskPriority, TaskStatus, TaskType
from app.schemas.task import TaskRead


PRIORITY_ALIASES = {
    "low": TaskPriority.LOW.value,
    "baixa": TaskPriority.LOW.value,
    "medium": TaskPriority.MEDIUM.value,
    "media": TaskPriority.MEDIUM.value,
    "média": TaskPriority.MEDIUM.value,
    "high": TaskPriority.HIGH.value,
    "alta": TaskPriority.HIGH.value,
}

STATUS_ALIASES = {
    "pending": TaskStatus.PENDING.value,
    "pendente": TaskStatus.PENDING.value,
    "in_progress": TaskStatus.IN_PROGRESS.value,
    "em_andamento": TaskStatus.IN_PROGRESS.value,
    "done": TaskStatus.DONE.value,
    "completed": TaskStatus.DONE.value,
    "concluida": TaskStatus.DONE.value,
    "concluída": TaskStatus.DONE.value,
    "overdue": TaskStatus.OVERDUE.value,
    "atrasada": TaskStatus.OVERDUE.value,
}

TASK_TYPE_ALIASES = {
    "task": TaskType.TASK.value,
    "tarefa": TaskType.TASK.value,
    "exam": TaskType.EXAM.value,
    "prova": TaskType.EXAM.value,
    "appointment": TaskType.APPOINTMENT.value,
    "consulta": TaskType.APPOINTMENT.value,
    "event": TaskType.EVENT.value,
    "evento": TaskType.EVENT.value,
    "reminder": TaskType.REMINDER.value,
    "lembrete": TaskType.REMINDER.value,
}


class AutomationTaskInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str = Field(min_length=2, max_length=180)
    description: str | None = Field(default=None, max_length=1200)
    date: Date
    time: Time
    responsible: str | None = Field(default=None, min_length=2, max_length=255)
    responsible_id: str | None = Field(default=None, validation_alias=AliasChoices("responsible_id", "responsibleId"))
    category: str | None = Field(default=None, min_length=2, max_length=80)
    category_id: str | None = Field(default=None, validation_alias=AliasChoices("category_id", "categoryId"))
    priority: TaskPriority = TaskPriority.MEDIUM
    status: TaskStatus = TaskStatus.PENDING
    task_type: TaskType = Field(default=TaskType.TASK, validation_alias=AliasChoices("type", "task_type", "taskType"))
    timezone: str = Field(default="America/Sao_Paulo", validation_alias=AliasChoices("timezone", "time_zone", "timeZone"))
    external_id: str | None = Field(default=None, max_length=160, validation_alias=AliasChoices("external_id", "externalId", "automation_external_id", "automationExternalId"))
    source: str = Field(default="codex", min_length=2, max_length=80, validation_alias=AliasChoices("source", "automation_source", "automationSource"))
    source_label: str | None = Field(default=None, max_length=180, validation_alias=AliasChoices("source_label", "sourceLabel", "automation_source_label", "automationSourceLabel"))
    source_reference: str | None = Field(default=None, max_length=1200, validation_alias=AliasChoices("source_reference", "sourceReference", "automation_source_reference", "automationSourceReference"))
    recurrence_rule: str | None = Field(default=None, max_length=255, validation_alias=AliasChoices("recurrence_rule", "recurrenceRule"))
    reminder_enabled: bool = Field(default=False, validation_alias=AliasChoices("reminder_enabled", "reminderEnabled"))
    reminder_value: int | None = Field(default=None, gt=0, validation_alias=AliasChoices("reminder_value", "reminderValue"))
    reminder_unit: Literal["minutes", "hours", "days"] | None = Field(default=None, validation_alias=AliasChoices("reminder_unit", "reminderUnit"))

    @field_validator("title", "description", "responsible", "category", "external_id", "source", "source_label", "source_reference", "recurrence_rule", mode="before")
    @classmethod
    def strip_text(cls, value):
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("priority", mode="before")
    @classmethod
    def normalize_priority(cls, value):
        if isinstance(value, str):
            return PRIORITY_ALIASES.get(value.strip().lower(), value)
        return value

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, value):
        if isinstance(value, str):
            return STATUS_ALIASES.get(value.strip().lower(), value)
        return value

    @field_validator("task_type", mode="before")
    @classmethod
    def normalize_task_type(cls, value):
        if isinstance(value, str):
            return TASK_TYPE_ALIASES.get(value.strip().lower(), value)
        return value

    @field_validator("time")
    @classmethod
    def require_minute_precision(cls, value: Time):
        if value.second or value.microsecond:
            raise ValueError("Use horario no formato HH:MM, sem segundos.")
        return value

    @model_validator(mode="after")
    def require_responsible_and_category(self):
        if not self.responsible and not self.responsible_id:
            raise ValueError("Informe responsible ou responsible_id.")
        if not self.category and not self.category_id:
            raise ValueError("Informe category ou category_id.")
        if self.reminder_enabled and (self.reminder_value is None or self.reminder_unit is None):
            raise ValueError("Informe reminder_value e reminder_unit quando reminder_enabled=true.")
        if not self.reminder_enabled and (self.reminder_value is not None or self.reminder_unit is not None):
            raise ValueError("Ative reminder_enabled para enviar reminder_value ou reminder_unit.")
        return self


class AutomationTaskUpdateInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str | None = Field(default=None, min_length=2, max_length=180)
    description: str | None = Field(default=None, max_length=1200)
    date: Date | None = None
    time: Time | None = None
    responsible: str | None = Field(default=None, min_length=2, max_length=255)
    responsible_id: str | None = Field(default=None, validation_alias=AliasChoices("responsible_id", "responsibleId"))
    category: str | None = Field(default=None, min_length=2, max_length=80)
    category_id: str | None = Field(default=None, validation_alias=AliasChoices("category_id", "categoryId"))
    priority: TaskPriority | None = None
    status: TaskStatus | None = None
    task_type: TaskType | None = Field(default=None, validation_alias=AliasChoices("type", "task_type", "taskType"))
    timezone: str = Field(default="America/Sao_Paulo", validation_alias=AliasChoices("timezone", "time_zone", "timeZone"))
    external_id: str | None = Field(default=None, max_length=160, validation_alias=AliasChoices("external_id", "externalId", "automation_external_id", "automationExternalId"))
    source: str | None = Field(default=None, min_length=2, max_length=80, validation_alias=AliasChoices("source", "automation_source", "automationSource"))
    source_label: str | None = Field(default=None, max_length=180, validation_alias=AliasChoices("source_label", "sourceLabel", "automation_source_label", "automationSourceLabel"))
    source_reference: str | None = Field(default=None, max_length=1200, validation_alias=AliasChoices("source_reference", "sourceReference", "automation_source_reference", "automationSourceReference"))
    recurrence_rule: str | None = Field(default=None, max_length=255, validation_alias=AliasChoices("recurrence_rule", "recurrenceRule"))
    reminder_enabled: bool | None = Field(default=None, validation_alias=AliasChoices("reminder_enabled", "reminderEnabled"))
    reminder_value: int | None = Field(default=None, gt=0, validation_alias=AliasChoices("reminder_value", "reminderValue"))
    reminder_unit: Literal["minutes", "hours", "days"] | None = Field(default=None, validation_alias=AliasChoices("reminder_unit", "reminderUnit"))

    @field_validator("title", "description", "responsible", "category", "external_id", "source", "source_label", "source_reference", "recurrence_rule", mode="before")
    @classmethod
    def strip_text(cls, value):
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("priority", mode="before")
    @classmethod
    def normalize_priority(cls, value):
        if isinstance(value, str):
            return PRIORITY_ALIASES.get(value.strip().lower(), value)
        return value

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, value):
        if isinstance(value, str):
            return STATUS_ALIASES.get(value.strip().lower(), value)
        return value

    @field_validator("task_type", mode="before")
    @classmethod
    def normalize_task_type(cls, value):
        if isinstance(value, str):
            return TASK_TYPE_ALIASES.get(value.strip().lower(), value)
        return value

    @field_validator("time")
    @classmethod
    def require_minute_precision(cls, value: Time | None):
        if value and (value.second or value.microsecond):
            raise ValueError("Use horario no formato HH:MM, sem segundos.")
        return value

    @model_validator(mode="after")
    def require_complete_datetime_and_reminder(self):
        if (self.date is None) != (self.time is None):
            raise ValueError("Envie date e time juntos para alterar o horario.")
        if self.reminder_enabled is True and (self.reminder_value is None or self.reminder_unit is None):
            raise ValueError("Informe reminder_value e reminder_unit quando reminder_enabled=true.")
        if self.reminder_enabled is False and (self.reminder_value is not None or self.reminder_unit is not None):
            raise ValueError("Nao envie reminder_value ou reminder_unit ao desativar lembrete.")
        return self


class AutomationTaskRescheduleInput(BaseModel):
    date: Date
    time: Time
    timezone: str = Field(default="America/Sao_Paulo", validation_alias=AliasChoices("timezone", "time_zone", "timeZone"))
    source_reference: str | None = Field(default=None, max_length=1200, validation_alias=AliasChoices("source_reference", "sourceReference"))

    @field_validator("time")
    @classmethod
    def require_minute_precision(cls, value: Time):
        if value.second or value.microsecond:
            raise ValueError("Use horario no formato HH:MM, sem segundos.")
        return value


class AutomationTaskLookup(BaseModel):
    task_id: str | None = Field(default=None, validation_alias=AliasChoices("task_id", "taskId"))
    external_id: str | None = Field(default=None, validation_alias=AliasChoices("external_id", "externalId"))
    source: str = "codex"

    @model_validator(mode="after")
    def require_lookup(self):
        if not self.task_id and not self.external_id:
            raise ValueError("Informe task_id ou external_id.")
        return self


class AutomationDuplicateRead(BaseModel):
    index: int
    title: str
    existing_task_id: str | None = None
    external_id: str | None = None
    reason: str


class AutomationTaskResult(BaseModel):
    index: int | None = None
    action: Literal["created", "skipped_duplicate", "failed", "updated", "rescheduled", "cancelled"]
    task_id: str | None = None
    external_id: str | None = None
    title: str | None = None
    message: str
    task: TaskRead | None = None


class AutomationTasksResponse(BaseModel):
    request_id: str
    total_received: int
    total_created: int
    total_skipped: int
    total_failed: int
    created_tasks: list[TaskRead]
    skipped_duplicates: list[AutomationDuplicateRead]
    results: list[AutomationTaskResult]


class AutomationTaskOperationResponse(BaseModel):
    request_id: str
    action: Literal["updated", "rescheduled", "cancelled"]
    task_id: str
    message: str
    task: TaskRead | None = None
