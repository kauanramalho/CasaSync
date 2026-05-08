from pydantic import BaseModel


class GoogleCalendarStatus(BaseModel):
    provider: str = "google"
    is_connected: bool
    calendar_id: str | None = None
    message: str


class GoogleCalendarConnectUrl(BaseModel):
    url: str | None = None
    message: str

