from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


ImageSuggestionType = Literal["task", "event", "reminder"]
ImageSuggestionPriority = Literal["low", "medium", "high", "urgent"]


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


class ImageAnalysisResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    sourceType: Literal["image"] = "image"
    overallConfidence: float = Field(ge=0.0, le=1.0)
    items: list[ImageAnalysisItem] = Field(default_factory=list, max_length=20)
    warnings: list[str] = Field(default_factory=list, max_length=10)
    needsUserReview: bool = True
