from datetime import datetime
from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


GoogleCalendarMode = Literal["primary", "family_calendar", "disabled"]


class GoogleCalendarStatus(BaseModel):
    provider: str = "google"
    is_enabled: bool = False
    is_connected: bool
    can_connect: bool = False
    can_sync: bool = False
    family_id: str | None = None
    mode: GoogleCalendarMode = "primary"
    calendar_id: str | None = None
    calendar_name: str | None = None
    effective_calendar_id: str | None = None
    family_calendar_configured: bool = False
    connected_at: datetime | None = None
    message: str


class GoogleCalendarFamilySettingsRead(BaseModel):
    provider: str = "google"
    family_id: str
    user_id: str
    mode: GoogleCalendarMode = "primary"
    google_calendar_id: str | None = None
    google_calendar_name: str | None = None
    effective_calendar_id: str | None = None
    message: str


class GoogleCalendarFamilySettingsUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    mode: GoogleCalendarMode = "primary"
    google_calendar_id: str | None = Field(default=None, max_length=255, validation_alias=AliasChoices("google_calendar_id", "googleCalendarId"))
    google_calendar_name: str | None = Field(default=None, max_length=180, validation_alias=AliasChoices("google_calendar_name", "googleCalendarName"))


class GoogleCalendarFamilyCalendarResponse(BaseModel):
    provider: str = "google"
    status: str
    family_id: str
    calendar_id: str | None = None
    calendar_name: str | None = None
    message: str


class GoogleCalendarConnectUrl(BaseModel):
    url: str | None = None
    message: str
    state_expires_in_seconds: int | None = None


class GoogleCalendarCallbackResponse(BaseModel):
    provider: str = "google"
    status: str
    message: str


class GoogleCalendarTaskSyncResponse(BaseModel):
    provider: str = "google"
    status: str
    synced: bool = False
    task_id: str | None = None
    event_id: str | None = None
    message: str
    event: dict[str, Any] | None = None


class GoogleCalendarTaskDeleteEventResponse(BaseModel):
    provider: str = "google"
    status: str
    deleted: bool = False
    missing: bool = False
    task_id: str | None = None
    event_id: str | None = None
    message: str


class GoogleCalendarDisconnectResponse(BaseModel):
    provider: str = "google"
    status: str
    disconnected: bool = False
    message: str
