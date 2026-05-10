from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import ORMModel


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserRead(ORMModel):
    id: str
    name: str
    username: str | None = None
    email: EmailStr
    avatar_url: str | None = None
    email_verified: bool
    two_factor_enabled: bool
    created_at: datetime


class UserSummary(ORMModel):
    id: str
    name: str
    username: str | None = None
    email: EmailStr
    avatar_url: str | None = None


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    username: str | None = Field(default=None, min_length=2, max_length=80)
    email: EmailStr | None = None
    avatar_url: str | None = Field(default=None, max_length=300000)


class PasswordUpdate(BaseModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)
