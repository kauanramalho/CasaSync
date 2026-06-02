from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.deps import get_current_user, get_family_id
from app.database.session import get_db
from app.models.user import User
from app.schemas.integration import (
    GoogleCalendarConnectUrl,
    GoogleCalendarDisconnectResponse,
    GoogleCalendarFamilyCalendarResponse,
    GoogleCalendarFamilySettingsRead,
    GoogleCalendarFamilySettingsUpdate,
    GoogleCalendarStatus,
    GoogleCalendarTaskSyncResponse,
)
from app.services.calendar_service import (
    build_google_callback_redirect,
    disconnect_google_calendar,
    ensure_google_family_calendar,
    get_google_auth_url,
    get_google_calendar_family_settings,
    get_google_calendar_status,
    handle_google_callback,
    sync_task_to_calendar,
    update_google_calendar_family_settings,
)


router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("/google-calendar/status", response_model=GoogleCalendarStatus)
def google_calendar_status(
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    return get_google_calendar_status(db, family_id, current_user.id, settings)


@router.get("/google-calendar/settings", response_model=GoogleCalendarFamilySettingsRead)
def google_calendar_family_settings(
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    return get_google_calendar_family_settings(db, family_id=family_id, user_id=current_user.id)


@router.patch("/google-calendar/settings", response_model=GoogleCalendarFamilySettingsRead)
def google_calendar_update_family_settings(
    payload: GoogleCalendarFamilySettingsUpdate,
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    return update_google_calendar_family_settings(db, family_id=family_id, user_id=current_user.id, payload=payload)


@router.post("/google-calendar/family-calendar", response_model=GoogleCalendarFamilyCalendarResponse)
def google_calendar_ensure_family_calendar(
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    return ensure_google_family_calendar(db, family_id=family_id, user_id=current_user.id, settings=settings)


@router.get("/google-calendar/connect-url", response_model=GoogleCalendarConnectUrl)
def google_calendar_connect_url(
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    settings: Settings = Depends(get_settings),
):
    return get_google_auth_url(current_user_id=current_user.id, family_id=family_id, settings=settings)


@router.get("/google-calendar/callback", response_model=None)
def google_calendar_callback(
    code: str | None = Query(default=None, max_length=4096),
    state: str | None = Query(default=None, max_length=4096),
    error: str | None = Query(default=None, max_length=200),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    result = handle_google_callback(db, code=code, state=state, error=error, settings=settings)
    return RedirectResponse(build_google_callback_redirect(settings, result), status_code=302)


@router.post("/google-calendar/tasks/{task_id}/sync", response_model=GoogleCalendarTaskSyncResponse)
def google_calendar_sync_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    return sync_task_to_calendar(
        db,
        family_id=family_id,
        user_id=current_user.id,
        task_id=task_id,
        settings=settings,
    )


@router.post("/google-calendar/disconnect", response_model=GoogleCalendarDisconnectResponse)
def google_calendar_disconnect(
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    return disconnect_google_calendar(
        db,
        family_id=family_id,
        user_id=current_user.id,
        settings=settings,
    )
