import logging
import smtplib
from email.message import EmailMessage

from fastapi import HTTPException, status

from app.core.config import get_settings


logger = logging.getLogger(__name__)


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

    if settings.email_dev_mode:
        logger.warning(
            "[CasaSync DEV EMAIL] EMAIL_DEV_MODE=true; codigo 2FA para %s (%s): %s "
            "(expira em %s minutos)",
            recipient,
            _purpose_label(purpose),
            code,
            expires_minutes,
        )
        return

    if settings.smtp_configured:
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

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=(
            "Envio de e-mail 2FA nao configurado. Configure SMTP_HOST ou ative "
            "EMAIL_DEV_MODE=true apenas para teste controlado."
        ),
    )
