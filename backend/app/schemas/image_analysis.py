from typing import Literal

import re

from pydantic import BaseModel, ConfigDict, Field, field_validator


ImageSuggestionType = Literal["task", "event", "reminder"]
ImageSuggestionPriority = Literal["low", "medium", "high", "urgent"]
ImageSuggestionReminderUnit = Literal["minutes", "hours", "days"]
MAX_AI_TASK_IMPORT_INSTRUCTIONS_LENGTH = 1500
SECRET_PATTERN = re.compile(r"(sk-[a-zA-Z0-9_-]{20,}|client_secret|refresh_token|access_token)", re.IGNORECASE)


class ImageAnalysisItem(BaseModel):
    type: ImageSuggestionType
    title: str = Field(min_length=2, max_length=180)
    description: str | None = Field(default=None, max_length=1200)
    date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    endDate: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    endTime: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    category: str | None = Field(default=None, max_length=80)
    priority: ImageSuggestionPriority | None = None
    responsible: str | None = Field(default=None, max_length=120)
    confidence: float = Field(ge=0.0, le=1.0)
    warnings: list[str] = Field(default_factory=list, max_length=10)
    reminderEnabled: bool = False
    reminderValue: int | None = Field(default=None, gt=0, le=365)
    reminderUnit: ImageSuggestionReminderUnit | None = None
    sourceImageName: str | None = Field(default=None, max_length=255)
    originalText: str | None = Field(default=None, max_length=1200)
    needsReview: bool = True
    googleCalendarSuggestion: bool = False


class ImageAnalysisFileError(BaseModel):
    filename: str | None = Field(default=None, max_length=255)
    reason: str


class ImageAnalysisResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    sourceType: Literal["image"] = "image"
    overallConfidence: float = Field(ge=0.0, le=1.0)
    items: list[ImageAnalysisItem] = Field(default_factory=list, max_length=20)
    warnings: list[str] = Field(default_factory=list, max_length=10)
    needsUserReview: bool = True
    imageErrors: list[ImageAnalysisFileError] = Field(default_factory=list, max_length=10)
    totalImagesProcessed: int = 0
    totalSuggestionsGenerated: int = 0


def normalize_ai_task_import_instructions(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", value).strip()
    if not normalized:
        return None
    if len(normalized) > MAX_AI_TASK_IMPORT_INSTRUCTIONS_LENGTH:
        raise ValueError(f"As instrucoes devem ter no maximo {MAX_AI_TASK_IMPORT_INSTRUCTIONS_LENGTH} caracteres.")
    if SECRET_PATTERN.search(normalized):
        raise ValueError("Nao inclua chaves, tokens ou segredos nas instrucoes da IA.")
    return normalized


class ImageAnalysisPreferences(BaseModel):
    customInstructions: str | None = None
    maxLength: int = MAX_AI_TASK_IMPORT_INSTRUCTIONS_LENGTH


class ImageAnalysisPreferencesUpdate(BaseModel):
    customInstructions: str | None = Field(default=None, max_length=MAX_AI_TASK_IMPORT_INSTRUCTIONS_LENGTH)

    @field_validator("customInstructions")
    @classmethod
    def normalize_custom_instructions(cls, value: str | None) -> str | None:
        return normalize_ai_task_import_instructions(value)
