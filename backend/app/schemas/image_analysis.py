from datetime import datetime
from typing import Literal

import re

from pydantic import BaseModel, ConfigDict, Field, field_validator


ImageSuggestionType = Literal["task", "event", "reminder"]
ImageSuggestionPriority = Literal["low", "medium", "high", "urgent"]
ImageSuggestionReminderUnit = Literal["minutes", "hours", "days"]
ImageSuggestionDateYearSource = Literal["explicit", "inferred", "unknown"]
ImageAssigneeResolutionStatus = Literal["resolved", "unresolved", "ambiguous", "not_found"]
ImageAnalysisJobStatusValue = Literal[
    "pending",
    "processing",
    "extracting",
    "validating",
    "ready_for_review",
    "creating_tasks",
    "syncing_calendar",
    "completed",
    "failed",
    "cancelled",
]
MAX_AI_TASK_IMPORT_INSTRUCTIONS_LENGTH = 1500
MAX_AI_IMAGE_CONTEXT_LENGTH = 1500
SECRET_PATTERN = re.compile(r"(sk-[a-zA-Z0-9_-]{20,}|client_secret|refresh_token|access_token)", re.IGNORECASE)


class ImageAnalysisReminder(BaseModel):
    value: int = Field(gt=0, le=4320)
    unit: ImageSuggestionReminderUnit


class ImageAnalysisItem(BaseModel):
    type: ImageSuggestionType
    title: str = Field(min_length=2, max_length=180)
    description: str | None = Field(default=None, max_length=1200)
    date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    endDate: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    endTime: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    dateYearSource: ImageSuggestionDateYearSource | None = None
    category: str | None = Field(default=None, max_length=80)
    categoryId: str | None = Field(default=None, max_length=36)
    priority: ImageSuggestionPriority | None = None
    responsible: str | None = Field(default=None, max_length=120)
    assigneeId: str | None = Field(default=None, max_length=36)
    assigneeIds: list[str] = Field(default_factory=list, max_length=20)
    assigneeNames: list[str] = Field(default_factory=list, max_length=20)
    resolvedAssigneeNames: list[str] = Field(default_factory=list, max_length=20)
    originalAssigneeText: str | None = Field(default=None, max_length=180)
    assigneeResolutionStatus: ImageAssigneeResolutionStatus | None = None
    assigneeResolutionWarnings: list[str] = Field(default_factory=list, max_length=10)
    confidence: float = Field(ge=0.0, le=1.0)
    warnings: list[str] = Field(default_factory=list, max_length=10)
    reminderEnabled: bool = False
    reminderValue: int | None = Field(default=None, gt=0, le=4320)
    reminderUnit: ImageSuggestionReminderUnit | None = None
    sourceImageName: str | None = Field(default=None, max_length=255)
    originalText: str | None = Field(default=None, max_length=1200)
    needsReview: bool = True
    googleCalendarSuggestion: bool = False
    reminders: list[ImageAnalysisReminder] = Field(default_factory=list, max_length=5)


class ImageAnalysisFileError(BaseModel):
    filename: str | None = Field(default=None, max_length=255)
    reason: str


class ImageAnalysisResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    sourceType: Literal["image"] = "image"
    overallConfidence: float = Field(ge=0.0, le=1.0)
    items: list[ImageAnalysisItem] = Field(default_factory=list, max_length=40)
    warnings: list[str] = Field(default_factory=list, max_length=10)
    needsUserReview: bool = True
    imageErrors: list[ImageAnalysisFileError] = Field(default_factory=list, max_length=10)
    totalImagesProcessed: int = 0
    totalSuggestionsGenerated: int = 0


class ImageAnalysisJobCreated(BaseModel):
    jobId: str
    status: ImageAnalysisJobStatusValue
    progress: int = Field(ge=0, le=100)
    message: str
    totalImages: int = 0


class ImageAnalysisJobStatus(BaseModel):
    jobId: str
    status: ImageAnalysisJobStatusValue
    progress: int = Field(ge=0, le=100)
    message: str
    totalImages: int = 0
    processedImages: int = 0
    totalSuggestionsGenerated: int = 0
    createdAt: datetime | None = None
    updatedAt: datetime | None = None
    completedAt: datetime | None = None
    result: ImageAnalysisResponse | None = None
    error: str | None = None


def _normalize_ai_user_text(value: str | None, *, max_length: int, field_label: str) -> str | None:
    if value is None:
        return None
    normalized = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", value).strip()
    if not normalized:
        return None
    if len(normalized) > max_length:
        raise ValueError(f"{field_label} deve ter no maximo {max_length} caracteres.")
    if SECRET_PATTERN.search(normalized):
        raise ValueError(f"Nao inclua chaves, tokens ou segredos em {field_label.lower()}.")
    return normalized


def normalize_ai_task_import_instructions(value: str | None) -> str | None:
    return _normalize_ai_user_text(
        value,
        max_length=MAX_AI_TASK_IMPORT_INSTRUCTIONS_LENGTH,
        field_label="As instrucoes da IA",
    )


def normalize_ai_image_context(value: str | None) -> str | None:
    return _normalize_ai_user_text(
        value,
        max_length=MAX_AI_IMAGE_CONTEXT_LENGTH,
        field_label="O contexto da imagem",
    )


class ImageAnalysisPreferences(BaseModel):
    customInstructions: str | None = None
    maxLength: int = MAX_AI_TASK_IMPORT_INSTRUCTIONS_LENGTH


class ImageAnalysisPreferencesUpdate(BaseModel):
    customInstructions: str | None = Field(default=None, max_length=MAX_AI_TASK_IMPORT_INSTRUCTIONS_LENGTH)

    @field_validator("customInstructions")
    @classmethod
    def normalize_custom_instructions(cls, value: str | None) -> str | None:
        return normalize_ai_task_import_instructions(value)
