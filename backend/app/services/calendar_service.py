from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import create_access_token, decode_token
from app.models.integration import GoogleCalendarConnection
from app.models.task import Task
from app.schemas.integration import (
    GoogleCalendarCallbackResponse,
    GoogleCalendarConnectUrl,
    GoogleCalendarStatus,
    GoogleCalendarTaskSyncResponse,
)
from app.services.calendar_provider_adapter import (
    CalendarProviderConfigurationError,
    CalendarProviderNotImplementedError,
    GoogleCalendarOAuthConfig,
    get_calendar_provider_adapter,
)
from app.services.family_service import require_family_member
from app.services.task_service import get_task


GOOGLE_CALENDAR_DISABLED_MESSAGE = "Google Agenda esta desativado neste ambiente."
GOOGLE_CALENDAR_NOT_CONNECTED_MESSAGE = "Google Agenda ainda nao esta conectado para esta familia."
OAUTH_STATE_TTL_SECONDS = 10 * 60


def is_google_calendar_enabled(settings: Settings) -> bool:
    return bool(settings.google_calendar_enabled)


def _get_connection(db: Session, family_id: str) -> GoogleCalendarConnection | None:
    return db.query(GoogleCalendarConnection).filter(GoogleCalendarConnection.family_id == family_id).first()


def _oauth_config(settings: Settings) -> GoogleCalendarOAuthConfig:
    return GoogleCalendarOAuthConfig(
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        redirect_uri=settings.google_redirect_uri,
    )


def get_google_calendar_status(db: Session, family_id: str, settings: Settings) -> GoogleCalendarStatus:
    enabled = is_google_calendar_enabled(settings)
    configured = settings.google_calendar_configured

    if not enabled:
        return GoogleCalendarStatus(
            is_enabled=False,
            is_connected=False,
            can_connect=False,
            can_sync=False,
            message=GOOGLE_CALENDAR_DISABLED_MESSAGE,
        )

    connection = _get_connection(db, family_id)
    is_connected = bool(connection and connection.is_connected)
    if not configured:
        message = "Google Agenda habilitado, mas OAuth ainda nao configurado."
    elif is_connected:
        message = "Google Agenda conectado. A escrita real continua protegida pelo service backend."
    else:
        message = "Google Agenda habilitado, mas ainda nao conectado."

    return GoogleCalendarStatus(
        is_enabled=True,
        is_connected=is_connected,
        can_connect=configured,
        can_sync=is_connected,
        calendar_id=connection.calendar_id if connection else None,
        message=message,
    )


def _create_oauth_state(user_id: str, family_id: str) -> str:
    return create_access_token(
        subject=user_id,
        expires_delta=timedelta(seconds=OAUTH_STATE_TTL_SECONDS),
        extra_claims={"typ": "google_calendar_oauth_state", "family_id": family_id},
    )


def _decode_oauth_state(state: str) -> dict:
    try:
        payload = decode_token(state)
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Estado OAuth invalido ou expirado.") from exc

    if payload.get("typ") != "google_calendar_oauth_state" or not payload.get("sub") or not payload.get("family_id"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Estado OAuth invalido.")
    return payload


def get_google_auth_url(
    *,
    current_user_id: str,
    family_id: str,
    settings: Settings,
) -> GoogleCalendarConnectUrl:
    if not is_google_calendar_enabled(settings):
        return GoogleCalendarConnectUrl(url=None, message=GOOGLE_CALENDAR_DISABLED_MESSAGE)

    state = _create_oauth_state(current_user_id, family_id)
    adapter = get_calendar_provider_adapter("google")
    try:
        url = adapter.get_authorization_url(_oauth_config(settings), state)
    except CalendarProviderConfigurationError as exc:
        return GoogleCalendarConnectUrl(url=None, message=str(exc))

    return GoogleCalendarConnectUrl(
        url=url,
        message="URL OAuth preparada. A troca por tokens reais ainda deve ser ativada no backend antes de sincronizar eventos.",
        state_expires_in_seconds=OAUTH_STATE_TTL_SECONDS,
    )


def handle_google_callback(
    *,
    code: str | None,
    state: str | None,
    error: str | None,
    settings: Settings,
) -> GoogleCalendarCallbackResponse:
    if error:
        return GoogleCalendarCallbackResponse(status="denied", message="Autorizacao Google cancelada ou negada.")
    if not is_google_calendar_enabled(settings):
        return GoogleCalendarCallbackResponse(status="disabled", message=GOOGLE_CALENDAR_DISABLED_MESSAGE)
    if not code or not state:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Callback OAuth incompleto.")

    _decode_oauth_state(state)
    return GoogleCalendarCallbackResponse(
        status="not_implemented",
        message="Callback validado, mas a troca de codigo por tokens ainda nao foi ativada. Nenhum token foi salvo.",
    )


def _as_event_timezone(value: datetime, timezone_name: str) -> datetime:
    try:
        target_timezone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        target_timezone = timezone.utc
    aware_value = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return aware_value.astimezone(target_timezone)


def _reminder_minutes(task: Task) -> int | None:
    if not task.reminder_enabled or not task.reminder_value or not task.reminder_unit:
        return None
    multipliers = {"minutes": 1, "hours": 60, "days": 24 * 60}
    multiplier = multipliers.get(task.reminder_unit)
    if not multiplier:
        return None
    return int(task.reminder_value) * multiplier


def create_calendar_event_from_task(task: Task, settings: Settings) -> dict:
    if not task.due_date:
        raise ValueError("Defina data e horario antes de sincronizar com o Google Agenda.")

    timezone_name = settings.google_calendar_default_timezone or "America/Sao_Paulo"
    duration_minutes = max(15, int(settings.google_calendar_default_event_minutes or 60))
    start = _as_event_timezone(task.due_date, timezone_name)
    end = start + timedelta(minutes=duration_minutes)

    description_parts = [task.description.strip()] if task.description else []
    if task.category:
        description_parts.append(f"Categoria CasaSync: {task.category.name}")
    description_parts.append("Origem: CasaSync.")

    event = {
        "summary": task.title,
        "description": "\n\n".join(description_parts),
        "start": {"dateTime": start.isoformat(), "timeZone": timezone_name},
        "end": {"dateTime": end.isoformat(), "timeZone": timezone_name},
        "extendedProperties": {"private": {"casasyncTaskId": task.id}},
    }

    reminder_minutes = _reminder_minutes(task)
    if reminder_minutes:
        event["reminders"] = {
            "useDefault": False,
            "overrides": [{"method": "popup", "minutes": reminder_minutes}],
        }

    return event


def sync_task_to_calendar(
    db: Session,
    *,
    family_id: str,
    user_id: str,
    task_id: str,
    settings: Settings,
) -> GoogleCalendarTaskSyncResponse:
    require_family_member(db, family_id, user_id)

    if not is_google_calendar_enabled(settings):
        return GoogleCalendarTaskSyncResponse(
            status="disabled",
            synced=False,
            task_id=task_id,
            message=GOOGLE_CALENDAR_DISABLED_MESSAGE,
        )

    task = get_task(db, family_id, task_id)
    try:
        event_payload = create_calendar_event_from_task(task, settings)
    except ValueError as exc:
        return GoogleCalendarTaskSyncResponse(status="invalid_task", synced=False, task_id=task.id, message=str(exc))

    connection = _get_connection(db, family_id)
    if not connection or not connection.is_connected:
        return GoogleCalendarTaskSyncResponse(
            status="not_connected",
            synced=False,
            task_id=task.id,
            message=GOOGLE_CALENDAR_NOT_CONNECTED_MESSAGE,
            event=event_payload,
        )

    adapter = get_calendar_provider_adapter("google")
    try:
        event_id = adapter.create_event(
            event_payload=event_payload,
            access_token_encrypted=connection.access_token_encrypted,
        )
    except CalendarProviderNotImplementedError as exc:
        return GoogleCalendarTaskSyncResponse(
            status="not_implemented",
            synced=False,
            task_id=task.id,
            message=str(exc),
            event=event_payload,
        )

    return GoogleCalendarTaskSyncResponse(
        status="synced",
        synced=True,
        task_id=task.id,
        event_id=event_id,
        message="Tarefa sincronizada com o Google Agenda.",
    )


def build_google_connect_url() -> tuple[str | None, str]:
    return (
        None,
        "Integracao preparada. Use get_google_auth_url com usuario, familia e settings para iniciar OAuth com seguranca.",
    )
