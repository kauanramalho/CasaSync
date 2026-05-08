from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import ORMModel


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserRead(ORMModel):
    id: str
    name: str
    email: EmailStr
    avatar_url: str | None = None
    created_at: datetime


class UserSummary(ORMModel):
    id: str
    name: str
    email: EmailStr
    avatar_url: str | None = None

