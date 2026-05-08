from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_family_id
from app.database.session import get_db
from app.schemas.integration import GoogleCalendarConnectUrl, GoogleCalendarStatus
from app.services.calendar_service import build_google_connect_url, get_google_calendar_status


router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("/google-calendar/status", response_model=GoogleCalendarStatus)
def google_calendar_status(family_id: str = Depends(get_family_id), db: Session = Depends(get_db)):
    connection = get_google_calendar_status(db, family_id)
    if not connection:
        return GoogleCalendarStatus(is_connected=False, message="Google Agenda ainda não conectado.")
    return GoogleCalendarStatus(
        is_connected=connection.is_connected,
        calendar_id=connection.calendar_id,
        message="Google Agenda conectado." if connection.is_connected else "Conexão criada, mas não autorizada.",
    )


@router.get("/google-calendar/connect-url", response_model=GoogleCalendarConnectUrl)
def google_calendar_connect_url():
    url, message = build_google_connect_url()
    return GoogleCalendarConnectUrl(url=url, message=message)

