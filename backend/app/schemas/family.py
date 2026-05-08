from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel
from app.schemas.user import UserSummary


class FamilyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=140)


class FamilyJoin(BaseModel):
    invite_code: str = Field(min_length=4, max_length=16)


class FamilyRead(ORMModel):
    id: str
    name: str
    invite_code: str
    created_by_id: str | None = None
    created_at: datetime


class FamilyMemberRead(ORMModel):
    id: str
    family_id: str
    user_id: str
    role: str
    points: int
    created_at: datetime
    user: UserSummary

