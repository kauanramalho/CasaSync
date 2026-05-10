import smtplib
from email.message import EmailMessage

from fastapi import HTTPException, status

from app.core.config import get_settings


def _purpose_label(purpose: str) -> str:
    return "cadastro" if purpose == "signup" else "login"


def send_two_factor_email(recipient: str, code: str, purpose: str, expires_minutes: int) -> None:
    settings = get_settings()
    subject = f"Codigo CasaSync para {_purpose_label(purpose)}"
    body = (
        "Use este codigo para continuar no CasaSync:\n\n"
        f"{code}\n\n"
        f"Ele expira em {expires_minutes} minutos. Se voce nao pediu este codigo, ignore este e-mail."
    )

    if settings.smtp_host:
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = settings.email_from
        message["To"] = recipient
        message.set_content(body)

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            if settings.smtp_username and settings.smtp_password:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(message)
        return

    if settings.environment == "development" and settings.email_dev_mode:
        print(
            f"[CasaSync DEV EMAIL] {subject} para {recipient}: {code} "
            f"(expira em {expires_minutes} minutos)"
        )
        return

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Envio de e-mail 2FA nao configurado.",
    )
