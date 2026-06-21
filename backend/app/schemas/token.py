from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.user import UserRead


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AuthResponse(Token):
    user: UserRead


class TwoFactorRequiredResponse(BaseModel):
    requires_two_factor: Literal[True] = True
    pending_token: str
    purpose: Literal["signup", "login"]
    masked_email: str
    expires_at: datetime
    delivery_mode: Literal["email", "development"] = "email"


class TwoFactorVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pending_token: str
    code: str = Field(min_length=6, max_length=6, pattern="^[0-9]{6}$")


class TwoFactorResendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pending_token: str
