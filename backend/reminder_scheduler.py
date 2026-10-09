"""Small stdlib-only client; no database or push credentials leave the API."""

import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener


API_ORIGIN = "https://casasync-api.onrender.com"
RESULT_FIELDS = (
    "scanned", "created", "skipped", "email_sent", "email_skipped", "email_failed",
    "push_sent", "push_skipped", "push_failed",
)


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def run_scheduler(token: str, *, opener=None) -> dict[str, int]:
    if len(token) < 32:
        raise ValueError("Credencial do agendador ausente ou invalida.")
    client = opener or build_opener(NoRedirects())
    # Wake the free API without sending a secret; cold starts can take a minute.
    with client.open(Request(f"{API_ORIGIN}/health/ready"), timeout=100) as response:
        if response.status != 200:
            raise ValueError("API indisponivel.")
    request = Request(f"{API_ORIGIN}/api/notifications/reminders/scheduled", data=b"",
                      headers={"Authorization": f"Bearer {token}", "Accept": "application/json"}, method="POST")
    with client.open(request, timeout=100) as response:
        payload = json.loads(response.read(8192))
    if not isinstance(payload, dict):
        raise ValueError("Resposta inesperada do agendador.")
    result = {}
    for field in RESULT_FIELDS:
        value = payload.get(field)
        if type(value) is not int or value < 0:
            raise ValueError("Resposta inesperada do agendador.")
        result[field] = value
    return result


def main() -> int:
    try:
        result = run_scheduler(os.environ.get("REMINDER_SCHEDULER_TOKEN", ""))
    except HTTPError as exc:
        print(f"Agendador recusado pela API (HTTP {exc.code}).", file=sys.stderr)
        return 1
    except (URLError, TimeoutError, ValueError, OSError):
        # Never print headers, secrets, provider bodies, or personal task data.
        print("Nao foi possivel processar lembretes; confira a API e a configuracao.", file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True))
    return 1 if result["email_failed"] or result["push_failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
