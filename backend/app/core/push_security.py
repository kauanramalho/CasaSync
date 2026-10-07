"""Restrict outbound Web Push traffic to browser-operated push services."""

from urllib.parse import urlsplit


def validate_push_endpoint(value: str) -> str:
    try:
        parsed = urlsplit(value)
        hostname = (parsed.hostname or "").lower()
        valid_host = hostname in {"fcm.googleapis.com", "web.push.apple.com"} or (
            hostname.endswith(".push.services.mozilla.com")
            or hostname.endswith(".notify.windows.com")
        )
        valid = (
            parsed.scheme == "https"
            and valid_host
            and parsed.port in {None, 443}
            and not parsed.username
            and not parsed.password
            and not parsed.fragment
            and parsed.path not in {"", "/"}
        )
    except (TypeError, ValueError):
        valid = False
    if not valid:
        raise ValueError("Destino de notificacao push invalido ou nao suportado.")
    return value
