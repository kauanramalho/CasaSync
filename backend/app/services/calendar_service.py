from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, urlsplit, urlunsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from jose import JWTError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import create_access_token, decode_token
from app.models.integration import GoogleCalendarConnection
from app.models.task import Task
from app.models.user import User
from app.schemas.integration import (
    GoogleCalendarCallbackResponse,
    GoogleCalendarConnectUrl,
    GoogleCalendarDisconnectResponse,
    GoogleCalendarStatus,
    GoogleCalendarTaskDeleteEventResponse,
    GoogleCalendarTaskSyncResponse,
)
from app.services.calendar_provider_adapter import (
    CalendarProviderAuthError,
    CalendarProviderConfigurationError,
    CalendarProviderError,
    CalendarTokenResult,
    GoogleCalendarOAuthConfig,
    get_calendar_provider_adapter,
)
from app.services.family_service import require_family_member
from app.services.secret_service import SecretDecryptionError, decrypt_secret, encrypt_secret
from app.services.task_service import get_task
from app.services.reminder_rules import reminder_to_minutes


GOOGLE_CALENDAR_DISABLED_MESSAGE = "Google Agenda esta desativado neste ambiente."
GOOGLE_CALENDAR_NOT_CONNECTED_MESSAGE = "Google Agenda ainda nao esta conectado para este usuario."
OAUTH_STATE_TTL_SECONDS = 10 * 60
DEFAULT_GOOGLE_CALENDAR_ID = "primary"
SAO_PAULO_FALLBACK_TZ = timezone(timedelta(hours=-3), name="America/Sao_Paulo")


def is_google_calendar_enabled(settings: Settings) -> bool:
    return bool(settings.google_calendar_enabled)


def _token_encryption_ready(settings: Settings) -> bool:
    return bool(settings.integration_token_encryption_key) or not settings.is_production


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _get_connection(db: Session, family_id: str, user_id: str) -> GoogleCalendarConnection | None:
    return (
        db.query(GoogleCalendarConnection)
        .filter(GoogleCalendarConnection.family_id == family_id, GoogleCalendarConnection.user_id == user_id)
        .first()
    )


def _get_legacy_family_connection(db: Session, family_id: str) -> GoogleCalendarConnection | None:
    return (
        db.query(GoogleCalendarConnection)
        .filter(GoogleCalendarConnection.family_id == family_id, GoogleCalendarConnection.user_id.is_(None))
        .first()
    )


def _oauth_config(settings: Settings) -> GoogleCalendarOAuthConfig:
    return GoogleCalendarOAuthConfig(
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        redirect_uri=settings.google_redirect_uri,
        timeout_seconds=settings.google_calendar_request_timeout_seconds,
    )


def get_google_calendar_status(db: Session, family_id: str, user_id: str, settings: Settings) -> GoogleCalendarStatus:
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

    require_family_member(db, family_id, user_id)
    connection = _get_connection(db, family_id, user_id)
    is_connected = bool(connection and connection.is_connected and connection.refresh_token_encrypted)
    encryption_ready = _token_encryption_ready(settings)
    if not configured:
        message = "Google Agenda habilitado, mas OAuth ainda nao configurado."
    elif not encryption_ready:
        message = "Google Agenda habilitado, mas a chave de criptografia de tokens nao foi configurada."
    elif is_connected:
        message = "Google Agenda conectado para sua conta."
    else:
        message = "Google Agenda habilitado, mas ainda nao conectado."

    return GoogleCalendarStatus(
        is_enabled=True,
        is_connected=is_connected,
        can_connect=configured and encryption_ready,
        can_sync=is_connected and encryption_ready,
        calendar_id=connection.calendar_id if connection else DEFAULT_GOOGLE_CALENDAR_ID,
        connected_at=connection.connected_at if connection and is_connected else None,
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
    if not _token_encryption_ready(settings):
        return GoogleCalendarConnectUrl(url=None, message="Configure INTEGRATION_TOKEN_ENCRYPTION_KEY antes de conectar o Google Agenda.")

    state = _create_oauth_state(current_user_id, family_id)
    adapter = get_calendar_provider_adapter("google")
    try:
        url = adapter.get_authorization_url(_oauth_config(settings), state)
    except CalendarProviderConfigurationError as exc:
        return GoogleCalendarConnectUrl(url=None, message=str(exc))

    return GoogleCalendarConnectUrl(
        url=url,
        message="Abra o Google para conectar sua conta com seguranca.",
        state_expires_in_seconds=OAUTH_STATE_TTL_SECONDS,
    )


def _apply_token_result(
    connection: GoogleCalendarConnection,
    token_result: CalendarTokenResult,
    settings: Settings,
) -> None:
    connection.access_token_encrypted = encrypt_secret(token_result.access_token, settings)
    if token_result.refresh_token:
        connection.refresh_token_encrypted = encrypt_secret(token_result.refresh_token, settings)
    connection.access_token_expires_at = token_result.expires_at
    connection.token_scope = token_result.token_scope
    connection.token_type = token_result.token_type
    connection.calendar_id = connection.calendar_id or DEFAULT_GOOGLE_CALENDAR_ID
    connection.is_connected = True
    connection.connected_at = _now()
    connection.disconnected_at = None


def handle_google_callback(
    db: Session,
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
    if not _token_encryption_ready(settings):
        return GoogleCalendarCallbackResponse(status="error", message="Criptografia de tokens nao configurada.")
    if not code or not state:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Callback OAuth incompleto.")

    payload = _decode_oauth_state(state)
    user_id = str(payload["sub"])
    family_id = str(payload["family_id"])
    user = db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario nao autorizado.")
    require_family_member(db, family_id, user_id)

    adapter = get_calendar_provider_adapter("google")
    try:
        token_result = adapter.exchange_code_for_tokens(_oauth_config(settings), code)
    except (CalendarProviderConfigurationError, CalendarProviderError) as exc:
        return GoogleCalendarCallbackResponse(status="error", message=str(exc))

    connection = _get_connection(db, family_id, user_id) or _get_legacy_family_connection(db, family_id)
    if not connection:
        connection = GoogleCalendarConnection(
            family_id=family_id,
            user_id=user_id,
            calendar_id=DEFAULT_GOOGLE_CALENDAR_ID,
        )
        db.add(connection)
    else:
        connection.user_id = user_id

    _apply_token_result(connection, token_result, settings)
    if not connection.refresh_token_encrypted:
        db.rollback()
        return GoogleCalendarCallbackResponse(
            status="error",
            message="O Google nao retornou refresh token. Desconecte o app no Google e conecte novamente.",
        )

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return GoogleCalendarCallbackResponse(
            status="error",
            message="Nao foi possivel salvar a conexao do Google Agenda. Tente novamente apos atualizar o banco local.",
        )
    return GoogleCalendarCallbackResponse(status="connected", message="Google Agenda conectado com sucesso.")


def _frontend_settings_url(settings: Settings, result: GoogleCalendarCallbackResponse) -> str:
    base_url = (settings.frontend_url or "").strip().rstrip("/")
    if not base_url:
        base_url = "https://casa-sync.vercel.app" if settings.is_production else "http://localhost:5173"
    parsed = urlsplit(base_url)
    query = urlencode({"googleCalendar": result.status, "message": result.message})
    return urlunsplit((parsed.scheme, parsed.netloc, "/configuracoes", query, ""))


def build_google_callback_redirect(settings: Settings, result: GoogleCalendarCallbackResponse) -> str:
    return _frontend_settings_url(settings, result)


def _as_event_timezone(value: datetime, timezone_name: str) -> datetime:
    try:
        target_timezone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        target_timezone = SAO_PAULO_FALLBACK_TZ
    aware_value = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return aware_value.astimezone(target_timezone)


def _task_reminder_minutes(task: Task) -> list[int]:
    reminders = [
        (reminder.value, reminder.unit)
        for reminder in getattr(task, "reminders", []) or []
        if reminder.value and reminder.unit
    ]
    if not reminders and task.reminder_enabled and task.reminder_value and task.reminder_unit:
        reminders = [(task.reminder_value, task.reminder_unit)]

    minutes: list[int] = []
    seen: set[int] = set()
    for value, unit in reminders:
        total_minutes = reminder_to_minutes(value, unit)
        if total_minutes is None or total_minutes <= 0 or total_minutes in seen:
            continue
        seen.add(total_minutes)
        minutes.append(total_minutes)
    return sorted(minutes)[:5]


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
        "extendedProperties": {"private": {"casasyncTaskId": task.id, "casasyncFamilyId": task.family_id}},
    }

    reminder_minutes = _task_reminder_minutes(task)
    if reminder_minutes:
        event["reminders"] = {
            "useDefault": False,
            "overrides": [{"method": "popup", "minutes": minutes} for minutes in reminder_minutes],
        }

    return event


def _without_calendar_reminders(event_payload: dict) -> dict:
    fallback_payload = dict(event_payload)
    fallback_payload.pop("reminders", None)
    return fallback_payload


def _connection_access_token(
    db: Session,
    connection: GoogleCalendarConnection,
    settings: Settings,
) -> str:
    try:
        access_token = decrypt_secret(connection.access_token_encrypted, settings)
        refresh_token = decrypt_secret(connection.refresh_token_encrypted, settings)
    except SecretDecryptionError as exc:
        connection.is_connected = False
        connection.disconnected_at = _now()
        db.commit()
        raise CalendarProviderAuthError("Conexao do Google Agenda precisa ser refeita.") from exc

    if not refresh_token:
        raise CalendarProviderAuthError("Conexao do Google Agenda precisa ser refeita.")

    expires_at = connection.access_token_expires_at
    needs_refresh = not access_token or not expires_at or expires_at <= (_now() + timedelta(minutes=2))
    if not needs_refresh:
        return access_token

    adapter = get_calendar_provider_adapter("google")
    token_result = adapter.refresh_access_token(_oauth_config(settings), refresh_token)
    _apply_token_result(connection, token_result, settings)
    db.commit()
    refreshed_token = decrypt_secret(connection.access_token_encrypted, settings)
    if not refreshed_token:
        raise CalendarProviderAuthError("Conexao do Google Agenda precisa ser refeita.")
    return refreshed_token


def _mark_task_synced(db: Session, task: Task, event_id: str, user_id: str) -> None:
    task.google_calendar_event_id = event_id
    task.google_calendar_synced_at = _now()
    task.google_calendar_synced_by_id = user_id
    db.commit()


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

    try:
        task = get_task(db, family_id, task_id)
        event_payload = create_calendar_event_from_task(task, settings)
    except ValueError as exc:
        return GoogleCalendarTaskSyncResponse(status="invalid_task", synced=False, task_id=task_id, message=str(exc))

    connection = _get_connection(db, family_id, user_id)
    if not connection or not connection.is_connected:
        return GoogleCalendarTaskSyncResponse(
            status="not_connected",
            synced=False,
            task_id=task.id,
            message=GOOGLE_CALENDAR_NOT_CONNECTED_MESSAGE,
            event=event_payload,
        )

    adapter = get_calendar_provider_adapter("google")
    calendar_id = connection.calendar_id or DEFAULT_GOOGLE_CALENDAR_ID
    try:
        access_token = _connection_access_token(db, connection, settings)
        if task.google_calendar_event_id:
            try:
                updated_event_id = adapter.update_event(
                    calendar_id=calendar_id,
                    access_token=access_token,
                    event_id=task.google_calendar_event_id,
                    event_payload=event_payload,
                    timeout_seconds=settings.google_calendar_request_timeout_seconds,
                )
                sync_message = "Evento existente atualizado no Google Agenda."
            except CalendarProviderAuthError:
                raise
            except CalendarProviderError:
                if "reminders" not in event_payload:
                    raise
                updated_event_id = adapter.update_event(
                    calendar_id=calendar_id,
                    access_token=access_token,
                    event_id=task.google_calendar_event_id,
                    event_payload=_without_calendar_reminders(event_payload),
                    timeout_seconds=settings.google_calendar_request_timeout_seconds,
                )
                sync_message = "Evento existente atualizado no Google Agenda sem lembretes porque o Google recusou os avisos."
            _mark_task_synced(db, task, updated_event_id, user_id)
            return GoogleCalendarTaskSyncResponse(
                status="updated",
                synced=True,
                task_id=task.id,
                event_id=updated_event_id,
                message=sync_message,
            )

        existing_event_id = adapter.find_event_by_task_id(
            calendar_id=calendar_id,
            access_token=access_token,
            task_id=task.id,
            timeout_seconds=settings.google_calendar_request_timeout_seconds,
        )
        if existing_event_id:
            _mark_task_synced(db, task, existing_event_id, user_id)
            return GoogleCalendarTaskSyncResponse(
                status="already_synced",
                synced=True,
                task_id=task.id,
                event_id=existing_event_id,
                message="Evento existente encontrado e vinculado a tarefa.",
            )
        try:
            event_id = adapter.create_event(
                calendar_id=calendar_id,
                access_token=access_token,
                event_payload=event_payload,
                timeout_seconds=settings.google_calendar_request_timeout_seconds,
            )
            sync_message = "Tarefa sincronizada com o Google Agenda."
        except CalendarProviderAuthError:
            raise
        except CalendarProviderError:
            if "reminders" not in event_payload:
                raise
            event_id = adapter.create_event(
                calendar_id=calendar_id,
                access_token=access_token,
                event_payload=_without_calendar_reminders(event_payload),
                timeout_seconds=settings.google_calendar_request_timeout_seconds,
            )
            sync_message = "Tarefa sincronizada com o Google Agenda sem lembretes porque o Google recusou os avisos."
    except CalendarProviderAuthError as exc:
        return GoogleCalendarTaskSyncResponse(status="auth_required", synced=False, task_id=task.id, message=str(exc))
    except CalendarProviderError as exc:
        return GoogleCalendarTaskSyncResponse(status="provider_error", synced=False, task_id=task.id, message=str(exc))

    _mark_task_synced(db, task, event_id, user_id)
    return GoogleCalendarTaskSyncResponse(
        status="synced",
        synced=True,
        task_id=task.id,
        event_id=event_id,
        message=sync_message,
    )


def delete_task_calendar_event(
    db: Session,
    *,
    family_id: str,
    user_id: str,
    task_id: str,
    settings: Settings,
) -> GoogleCalendarTaskDeleteEventResponse:
    require_family_member(db, family_id, user_id)
    task = get_task(db, family_id, task_id)
    event_id = task.google_calendar_event_id

    if not event_id:
        return GoogleCalendarTaskDeleteEventResponse(
            status="no_event",
            deleted=False,
            missing=False,
            task_id=task.id,
            message="A tarefa nao possui evento vinculado ao Google Agenda.",
        )

    if not is_google_calendar_enabled(settings):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=GOOGLE_CALENDAR_DISABLED_MESSAGE)

    connection_user_id = task.google_calendar_synced_by_id or user_id
    connection = _get_connection(db, family_id, connection_user_id)
    if not connection or not connection.is_connected:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nao foi possivel apagar no Google Agenda porque a conta vinculada nao esta conectada.",
        )

    adapter = get_calendar_provider_adapter("google")
    calendar_id = connection.calendar_id or DEFAULT_GOOGLE_CALENDAR_ID
    try:
        access_token = _connection_access_token(db, connection, settings)
        deleted = adapter.delete_event(
            calendar_id=calendar_id,
            access_token=access_token,
            event_id=event_id,
            timeout_seconds=settings.google_calendar_request_timeout_seconds,
        )
    except CalendarProviderAuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nao foi possivel apagar no Google Agenda. Reconecte sua conta Google e tente novamente.",
        ) from exc
    except CalendarProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Nao foi possivel apagar o evento do Google Agenda. Tente novamente ou apague apenas do CasaSync.",
        ) from exc

    return GoogleCalendarTaskDeleteEventResponse(
        status="deleted" if deleted else "missing",
        deleted=deleted,
        missing=not deleted,
        task_id=task.id,
        event_id=event_id,
        message="Evento do Google Agenda excluido." if deleted else "Evento do Google Agenda ja nao existia.",
    )


def disconnect_google_calendar(
    db: Session,
    *,
    family_id: str,
    user_id: str,
    settings: Settings,
) -> GoogleCalendarDisconnectResponse:
    require_family_member(db, family_id, user_id)

    if not is_google_calendar_enabled(settings):
        return GoogleCalendarDisconnectResponse(status="disabled", disconnected=False, message=GOOGLE_CALENDAR_DISABLED_MESSAGE)

    connection = _get_connection(db, family_id, user_id)
    if not connection or not connection.is_connected:
        return GoogleCalendarDisconnectResponse(status="not_connected", disconnected=True, message="Google Agenda ja estava desconectado.")

    revoke_warning = None
    try:
        token_to_revoke = decrypt_secret(connection.refresh_token_encrypted, settings) or decrypt_secret(connection.access_token_encrypted, settings)
        if token_to_revoke:
            get_calendar_provider_adapter("google").revoke_token(
                token=token_to_revoke,
                timeout_seconds=settings.google_calendar_request_timeout_seconds,
            )
    except (SecretDecryptionError, CalendarProviderError):
        revoke_warning = "A conexao local foi removida, mas a revogacao no Google deve ser conferida na conta Google."

    connection.is_connected = False
    connection.access_token_encrypted = None
    connection.refresh_token_encrypted = None
    connection.access_token_expires_at = None
    connection.token_scope = None
    connection.token_type = None
    connection.disconnected_at = _now()
    db.commit()

    return GoogleCalendarDisconnectResponse(
        status="disconnected",
        disconnected=True,
        message=revoke_warning or "Google Agenda desconectado com seguranca.",
    )


def build_google_connect_url() -> tuple[str | None, str]:
    return (
        None,
        "Use get_google_auth_url com usuario, familia e settings para iniciar OAuth com seguranca.",
    )
