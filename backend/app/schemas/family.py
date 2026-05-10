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
    description: str | None = None
    image_url: str | None = None
    invite_code: str
    created_by_id: str | None = None
    created_at: datetime


class FamilyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=140)
    description: str | None = Field(default=None, max_length=1200)
    image_url: str | None = None


class FamilyMemberUpdate(BaseModel):
    role: str = Field(pattern="^(admin|member)$")


class FamilyMemberRead(ORMModel):
    id: str
    family_id: str
    user_id: str
    role: str
    points: int
    created_at: datetime
    user: UserSummary


class FamilyJoinRequestRead(ORMModel):
    id: str
    family_id: str
    requester_id: str
    status: str
    expires_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    family: FamilyRead
    requester: UserSummary
