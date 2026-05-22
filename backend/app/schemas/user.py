from datetime import datetime

from pydantic import AliasChoices, BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.schemas.common import ORMModel
from app.schemas.image import MAX_IMAGE_URL_LENGTH, validate_image_url
from app.services.username_service import normalize_login_identifier, normalize_username


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    username: str | None = Field(default=None, max_length=30)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 2:
            raise ValueError("Informe um nome com pelo menos 2 caracteres.")
        return normalized

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().lower()

    @field_validator("username")
    @classmethod
    def normalize_create_username(cls, value: str | None) -> str | None:
        return normalize_username(value, required=False)


class UserLogin(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    identifier: str = Field(
        min_length=3,
        max_length=255,
        validation_alias=AliasChoices("identifier", "email"),
    )
    password: str = Field(min_length=8, max_length=128)

    @field_validator("identifier")
    @classmethod
    def normalize_identifier(cls, value: str) -> str:
        return normalize_login_identifier(value)


class UserRead(ORMModel):
    id: str
    name: str
    username: str | None = None
    email: EmailStr
    avatar_url: str | None = None
    email_verified: bool
    two_factor_enabled: bool
    email_task_reminders_enabled: bool = False
    push_task_reminders_enabled: bool = False
    ai_task_import_instructions: str | None = None
    created_at: datetime


class UserSummary(ORMModel):
    id: str
    name: str
    username: str | None = None
    email: EmailStr
    avatar_url: str | None = None


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    username: str | None = Field(default=None, max_length=30)
    email: EmailStr | None = None
    avatar_url: str | None = Field(default=None, max_length=MAX_IMAGE_URL_LENGTH)

    @field_validator("name")
    @classmethod
    def normalize_optional_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if len(normalized) < 2:
            raise ValueError("Informe um nome com pelo menos 2 caracteres.")
        return normalized

    @field_validator("username")
    @classmethod
    def normalize_optional_username(cls, value: str | None) -> str | None:
        return normalize_username(value, required=False)

    @field_validator("email")
    @classmethod
    def normalize_optional_email(cls, value: EmailStr | None) -> str | None:
        if value is None:
            return None
        return str(value).strip().lower()

    @field_validator("avatar_url")
    @classmethod
    def normalize_avatar_url(cls, value: str | None) -> str | None:
        return validate_image_url(value)


class PasswordUpdate(BaseModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)
