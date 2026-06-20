import json
import socket
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen


GOOGLE_CALENDAR_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"
GOOGLE_CALENDARS_URL = "https://www.googleapis.com/calendar/v3/calendars"
GOOGLE_CALENDAR_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/{calendar_id}/events"
GOOGLE_CALENDAR_SCOPES = (
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar",
)


class CalendarProviderConfigurationError(RuntimeError):
    pass


class CalendarProviderError(RuntimeError):
    pass


class CalendarProviderAuthError(CalendarProviderError):
    pass


class CalendarProviderNotFoundError(CalendarProviderError):
    pass


@dataclass(frozen=True)
class GoogleCalendarOAuthConfig:
    client_id: str | None
    client_secret: str | None
    redirect_uri: str | None
    scopes: tuple[str, ...] = GOOGLE_CALENDAR_SCOPES
    timeout_seconds: float = 20.0

    @property
    def is_configured(self) -> bool:
        return bool(self.client_id and self.client_secret and self.redirect_uri)


@dataclass(frozen=True)
class CalendarTokenResult:
    access_token: str
    refresh_token: str | None
    expires_at: datetime | None
    token_scope: str | None
    token_type: str | None


class CalendarProviderAdapter(Protocol):
    def get_authorization_url(self, config: GoogleCalendarOAuthConfig, state: str) -> str:
        ...

    def exchange_code_for_tokens(self, config: GoogleCalendarOAuthConfig, code: str) -> CalendarTokenResult:
        ...

    def refresh_access_token(self, config: GoogleCalendarOAuthConfig, refresh_token: str) -> CalendarTokenResult:
        ...

    def find_event_by_task_id(self, *, calendar_id: str, access_token: str, task_id: str, timeout_seconds: float) -> str | None:
        ...

    def create_event(self, *, calendar_id: str, access_token: str, event_payload: dict, timeout_seconds: float) -> str:
        ...

    def update_event(self, *, calendar_id: str, access_token: str, event_id: str, event_payload: dict, timeout_seconds: float) -> str:
        ...

    def delete_event(self, *, calendar_id: str, access_token: str, event_id: str, timeout_seconds: float) -> bool:
        ...

    def create_calendar(self, *, access_token: str, summary: str, time_zone: str, timeout_seconds: float) -> dict:
        ...

    def revoke_token(self, *, token: str, timeout_seconds: float) -> None:
        ...


def _timeout(value: float | None) -> float:
    return max(5.0, min(float(value or 20.0), 60.0))


def _expires_at(expires_in) -> datetime | None:
    try:
        seconds = int(expires_in)
    except (TypeError, ValueError):
        return None
    return datetime.now(timezone.utc) + timedelta(seconds=max(60, seconds - 60))


def _json_request(
    request: Request,
    timeout_seconds: float,
    *,
    auth_error_codes: frozenset[int] = frozenset({401, 403}),
) -> dict:
    try:
        with urlopen(request, timeout=_timeout(timeout_seconds)) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        if exc.code == 404:
            raise CalendarProviderNotFoundError("Evento do Google Agenda nao foi encontrado.") from exc
        if exc.code in auth_error_codes:
            raise CalendarProviderAuthError("Autorizacao do Google Agenda expirou ou foi revogada.") from exc
        raise CalendarProviderError("Google Agenda recusou a operacao. Tente novamente mais tarde.") from exc
    except (URLError, TimeoutError, socket.timeout) as exc:
        raise CalendarProviderError("Nao foi possivel falar com o Google Agenda agora.") from exc
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise CalendarProviderError("Google Agenda retornou uma resposta invalida.") from exc


def _token_request(config: GoogleCalendarOAuthConfig, payload: dict) -> CalendarTokenResult:
    if not config.is_configured:
        raise CalendarProviderConfigurationError(
            "Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI para usar o Google Agenda."
        )

    encoded_payload = urlencode(
        {
            "client_id": config.client_id,
            "client_secret": config.client_secret,
            **payload,
        }
    ).encode("utf-8")
    request = Request(
        GOOGLE_TOKEN_URL,
        data=encoded_payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    response = _json_request(request, config.timeout_seconds, auth_error_codes=frozenset({400, 401, 403}))
    access_token = response.get("access_token")
    if not access_token:
        raise CalendarProviderAuthError("O Google nao retornou um token de acesso valido.")
    return CalendarTokenResult(
        access_token=access_token,
        refresh_token=response.get("refresh_token"),
        expires_at=_expires_at(response.get("expires_in")),
        token_scope=response.get("scope"),
        token_type=response.get("token_type"),
    )


class GoogleCalendarProviderAdapter:
    provider = "google"

    def get_authorization_url(self, config: GoogleCalendarOAuthConfig, state: str) -> str:
        if not config.is_configured:
            raise CalendarProviderConfigurationError(
                "Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI para iniciar o OAuth."
            )

        query = urlencode(
            {
                "client_id": config.client_id,
                "redirect_uri": config.redirect_uri,
                "response_type": "code",
                "scope": " ".join(config.scopes),
                "access_type": "offline",
                "include_granted_scopes": "true",
                "prompt": "consent",
                "state": state,
            }
        )
        return f"{GOOGLE_CALENDAR_AUTH_URL}?{query}"

    def exchange_code_for_tokens(self, config: GoogleCalendarOAuthConfig, code: str) -> CalendarTokenResult:
        return _token_request(
            config,
            {
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": config.redirect_uri,
            },
        )

    def refresh_access_token(self, config: GoogleCalendarOAuthConfig, refresh_token: str) -> CalendarTokenResult:
        return _token_request(
            config,
            {
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )

    def find_event_by_task_id(self, *, calendar_id: str, access_token: str, task_id: str, timeout_seconds: float) -> str | None:
        query = urlencode(
            {
                "privateExtendedProperty": f"casasyncTaskId={task_id}",
                "maxResults": "1",
                "singleEvents": "true",
            }
        )
        url = f"{GOOGLE_CALENDAR_EVENTS_URL.format(calendar_id=quote(calendar_id, safe=''))}?{query}"
        request = Request(url, headers={"Authorization": f"Bearer {access_token}"}, method="GET")
        response = _json_request(request, timeout_seconds)
        items = response.get("items") if isinstance(response, dict) else None
        if not items:
            return None
        event_id = items[0].get("id") if isinstance(items[0], dict) else None
        return str(event_id) if event_id else None

    def create_event(self, *, calendar_id: str, access_token: str, event_payload: dict, timeout_seconds: float) -> str:
        url = GOOGLE_CALENDAR_EVENTS_URL.format(calendar_id=quote(calendar_id, safe=""))
        request = Request(
            url,
            data=json.dumps(event_payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        response = _json_request(request, timeout_seconds)
        event_id = response.get("id") if isinstance(response, dict) else None
        if not event_id:
            raise CalendarProviderError("Google Agenda nao retornou o id do evento criado.")
        return str(event_id)

    def update_event(self, *, calendar_id: str, access_token: str, event_id: str, event_payload: dict, timeout_seconds: float) -> str:
        url = f"{GOOGLE_CALENDAR_EVENTS_URL.format(calendar_id=quote(calendar_id, safe=''))}/{quote(event_id, safe='')}"
        request = Request(
            url,
            data=json.dumps(event_payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            method="PATCH",
        )
        response = _json_request(request, timeout_seconds)
        updated_event_id = response.get("id") if isinstance(response, dict) else None
        if not updated_event_id:
            raise CalendarProviderError("Google Agenda nao retornou o id do evento atualizado.")
        return str(updated_event_id)

    def delete_event(self, *, calendar_id: str, access_token: str, event_id: str, timeout_seconds: float) -> bool:
        url = f"{GOOGLE_CALENDAR_EVENTS_URL.format(calendar_id=quote(calendar_id, safe=''))}/{quote(event_id, safe='')}"
        request = Request(url, headers={"Authorization": f"Bearer {access_token}"}, method="DELETE")
        try:
            with urlopen(request, timeout=_timeout(timeout_seconds)):
                return True
        except HTTPError as exc:
            if exc.code == 404:
                return False
            if exc.code in {401, 403}:
                raise CalendarProviderAuthError("Autorizacao do Google Agenda expirou ou foi revogada.") from exc
            raise CalendarProviderError("Google Agenda recusou a exclusao do evento. Tente novamente mais tarde.") from exc
        except (URLError, TimeoutError, socket.timeout) as exc:
            raise CalendarProviderError("Nao foi possivel falar com o Google Agenda agora.") from exc

    def create_calendar(self, *, access_token: str, summary: str, time_zone: str, timeout_seconds: float) -> dict:
        payload = {"summary": summary, "timeZone": time_zone}
        request = Request(
            GOOGLE_CALENDARS_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        response = _json_request(request, timeout_seconds)
        calendar_id = response.get("id") if isinstance(response, dict) else None
        if not calendar_id:
            raise CalendarProviderError("Google Agenda nao retornou o id da agenda criada.")
        return {
            "id": str(calendar_id),
            "summary": str(response.get("summary") or summary),
        }

    def revoke_token(self, *, token: str, timeout_seconds: float) -> None:
        request = Request(
            GOOGLE_REVOKE_URL,
            data=urlencode({"token": token}).encode("utf-8"),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=_timeout(timeout_seconds)):
                return
        except HTTPError as exc:
            if exc.code == 400:
                return
            raise CalendarProviderError("Nao foi possivel revogar o acesso no Google agora.") from exc
        except (URLError, TimeoutError, socket.timeout) as exc:
            raise CalendarProviderError("Nao foi possivel falar com o Google para revogar o acesso.") from exc


def get_calendar_provider_adapter(provider: str = "google") -> CalendarProviderAdapter:
    normalized_provider = (provider or "google").strip().lower()
    if normalized_provider == "google":
        return GoogleCalendarProviderAdapter()
    return GoogleCalendarProviderAdapter()
