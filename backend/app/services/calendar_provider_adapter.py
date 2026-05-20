from dataclasses import dataclass
from typing import Protocol
from urllib.parse import urlencode


GOOGLE_CALENDAR_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_CALENDAR_SCOPES = ("https://www.googleapis.com/auth/calendar.events",)


class CalendarProviderConfigurationError(RuntimeError):
    pass


class CalendarProviderNotImplementedError(RuntimeError):
    pass


@dataclass(frozen=True)
class GoogleCalendarOAuthConfig:
    client_id: str | None
    client_secret: str | None
    redirect_uri: str | None
    scopes: tuple[str, ...] = GOOGLE_CALENDAR_SCOPES

    @property
    def is_configured(self) -> bool:
        return bool(self.client_id and self.client_secret and self.redirect_uri)


class CalendarProviderAdapter(Protocol):
    def get_authorization_url(self, config: GoogleCalendarOAuthConfig, state: str) -> str:
        ...

    def create_event(self, *, event_payload: dict, access_token_encrypted: str | None) -> str:
        ...


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

    def create_event(self, *, event_payload: dict, access_token_encrypted: str | None) -> str:
        raise CalendarProviderNotImplementedError(
            "Escrita real no Google Agenda ainda nao foi ativada. Implemente troca OAuth, criptografia de tokens e chamada Calendar API."
        )


def get_calendar_provider_adapter(provider: str = "google") -> CalendarProviderAdapter:
    normalized_provider = (provider or "google").strip().lower()
    if normalized_provider == "google":
        return GoogleCalendarProviderAdapter()
    return GoogleCalendarProviderAdapter()
