from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class TaskSuggestionReminder(BaseModel):
    value: int = Field(gt=0, le=4320)
    unit: Literal["minutes", "hours", "days"]


class TaskSuggestionImportItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    suggestionId: str | None = Field(default=None, max_length=80)
    type: str | None = Field(default="task", max_length=40)
    title: str | None = Field(default=None, max_length=180)
    description: str | None = Field(default=None, max_length=1200)
    date: str | None = Field(default=None, max_length=10)
    time: str | None = Field(default=None, max_length=5)
    endDate: str | None = Field(default=None, max_length=10)
    endTime: str | None = Field(default=None, max_length=5)
    category: str | None = Field(default=None, max_length=80)
    categoryId: str | None = Field(default=None, max_length=36)
    priority: str | None = Field(default=None, max_length=24)
    responsible: str | None = Field(default=None, max_length=120)
    assigneeId: str | None = Field(default=None, max_length=36)
    assigneeIds: list[str] | None = Field(default=None, max_length=20)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    warnings: list[str] = Field(default_factory=list, max_length=10)
    acceptedLowConfidence: bool = False
    reminderEnabled: bool = False
    reminderValue: int | None = Field(default=None, gt=0)
    reminderUnit: str | None = Field(default=None, max_length=16)
    reminders: list[TaskSuggestionReminder] | None = Field(default=None, max_length=5)
    sourceImageName: str | None = Field(default=None, max_length=255)
    originalText: str | None = Field(default=None, max_length=1200)


class TaskSuggestionsImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[TaskSuggestionImportItem] = Field(min_length=1, max_length=40)
    syncGoogleCalendar: bool = False
    autoCreate: bool = False


class ImportedTaskResult(BaseModel):
    suggestionId: str
    taskId: str
    title: str
    googleCalendarEventId: str | None = None
    googleCalendarMessage: str | None = None


class FailedTaskImportResult(BaseModel):
    suggestionId: str
    title: str
    reason: str


class TaskSuggestionsImportResponse(BaseModel):
    created: list[ImportedTaskResult] = Field(default_factory=list)
    failed: list[FailedTaskImportResult] = Field(default_factory=list)
    ignored: list[FailedTaskImportResult] = Field(default_factory=list)
    pendingReview: list[FailedTaskImportResult] = Field(default_factory=list)
    ignoredReminderCount: int = 0
    warnings: list[str] = Field(default_factory=list)
