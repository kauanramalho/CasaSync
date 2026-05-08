from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import GoalStatus
from app.schemas.common import ORMModel
from app.schemas.user import UserSummary


class CoupleGoalCreate(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    description: str | None = None
    target_date: datetime | None = None
    progress: int = Field(default=0, ge=0, le=100)


class CoupleGoalUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = None
    target_date: datetime | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    status: GoalStatus | None = None


class CoupleGoalRead(ORMModel):
    id: str
    family_id: str
    title: str
    description: str | None = None
    target_date: datetime | None = None
    progress: int = 0
    status: GoalStatus
    created_at: datetime
    created_by: UserSummary | None = None


class DateIdeaCreate(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    description: str | None = None
    location: str | None = Field(default=None, max_length=180)
    budget: str | None = Field(default=None, max_length=80)
    external_url: str | None = None
    image_url: str | None = None
    suggested_date: datetime | None = None
    mood: str = "romantico"


class DateIdeaUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = None
    location: str | None = Field(default=None, max_length=180)
    budget: str | None = Field(default=None, max_length=80)
    external_url: str | None = None
    image_url: str | None = None
    suggested_date: datetime | None = None
    mood: str | None = None
    is_done: bool | None = None


class DateIdeaRead(ORMModel):
    id: str
    family_id: str
    title: str
    description: str | None = None
    location: str | None = None
    budget: str | None = None
    external_url: str | None = None
    image_url: str | None = None
    suggested_date: datetime | None = None
    mood: str
    is_done: bool
    created_at: datetime
    created_by: UserSummary | None = None


class QuickNoteCreate(BaseModel):
    message: str = Field(min_length=1, max_length=1200)
    color: str = "rose"


class QuickNoteUpdate(BaseModel):
    message: str | None = Field(default=None, min_length=1, max_length=1200)
    color: str | None = None


class QuickNoteRead(ORMModel):
    id: str
    family_id: str
    message: str
    color: str = "rose"
    created_at: datetime
    created_by: UserSummary | None = None


class CoupleSpaceRead(BaseModel):
    goals: list[CoupleGoalRead]
    date_ideas: list[DateIdeaRead]
    notes: list[QuickNoteRead]
