from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import GoalStatus
from app.schemas.common import ORMModel
from app.schemas.user import UserSummary


class CoupleGoalCreate(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    description: str | None = None
    target_date: datetime | None = None


class CoupleGoalRead(ORMModel):
    id: str
    family_id: str
    title: str
    description: str | None = None
    target_date: datetime | None = None
    status: GoalStatus
    created_at: datetime
    created_by: UserSummary | None = None


class DateIdeaCreate(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    description: str | None = None
    suggested_date: datetime | None = None
    mood: str = "romântico"


class DateIdeaRead(ORMModel):
    id: str
    family_id: str
    title: str
    description: str | None = None
    suggested_date: datetime | None = None
    mood: str
    is_done: bool
    created_at: datetime
    created_by: UserSummary | None = None


class QuickNoteCreate(BaseModel):
    message: str = Field(min_length=1, max_length=1200)


class QuickNoteRead(ORMModel):
    id: str
    family_id: str
    message: str
    created_at: datetime
    created_by: UserSummary | None = None


class CoupleSpaceRead(BaseModel):
    goals: list[CoupleGoalRead]
    date_ideas: list[DateIdeaRead]
    notes: list[QuickNoteRead]

