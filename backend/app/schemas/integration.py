from datetime import datetime
from typing import Any

from pydantic import BaseModel


class GoogleCalendarStatus(BaseModel):
    provider: str = "google"
    is_enabled: bool = False
    is_connected: bool
    can_connect: bool = False
    can_sync: bool = False
    calendar_id: str | None = None
    connected_at: datetime | None = None
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
