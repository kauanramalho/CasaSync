import logging
import smtplib
from email.message import EmailMessage
from datetime import datetime
from html import escape

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
        logger.warning("EMAIL_DEV_MODE=true; entrega 2FA simulada apenas em ambiente local.")
        return

    if settings.smtp_configured:
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = settings.smtp_sender
        message["To"] = recipient
        message.set_content(body)

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            if settings.smtp_auth_username and settings.smtp_password:
                smtp.login(settings.smtp_auth_username, settings.smtp_password)
            smtp.send_message(message)
        return

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=(
            "Envio de e-mail 2FA nao configurado. Configure SMTP_HOST ou ative "
            "EMAIL_DEV_MODE=true apenas para teste controlado."
        ),
    )


def _format_due_date(value: datetime | None) -> str:
    if not value:
        return "sem prazo definido"
    return value.strftime("%d/%m/%Y as %H:%M")


def send_task_reminder_email(*, recipient: str, recipient_name: str, task_title: str, due_date: datetime | None, family_name: str | None = None) -> str:
    settings = get_settings()
    if not settings.email_notifications_enabled:
        return "disabled"
    if not settings.smtp_configured:
        return "not_configured"

    subject = f"Lembrete CasaSync: {task_title}"
    family_line = f"Familia: {family_name}\n" if family_name else ""
    body = (
        f"Ola, {recipient_name}!\n\n"
        "Uma tarefa do CasaSync esta chegando.\n\n"
        f"Tarefa: {task_title}\n"
        f"Prazo: {_format_due_date(due_date)}\n"
        f"{family_line}\n"
        "Abra o CasaSync para revisar detalhes, responsaveis e anexos.\n\n"
        "Se esta tarefa ja foi concluida, voce pode ignorar este aviso."
    )
    html_body = f"""
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <div style="max-width: 560px; margin: 0 auto; border: 1px solid #f1e3e7; border-radius: 18px; padding: 24px; background: #fffafa;">
        <p style="margin: 0 0 12px; color: #be5c72; font-weight: 700;">CasaSync</p>
        <h1 style="font-size: 22px; margin: 0 0 16px;">Lembrete de tarefa</h1>
        <p>Ola, {escape(recipient_name)}!</p>
        <p>Uma tarefa do CasaSync esta chegando.</p>
        <div style="background: #ffffff; border-radius: 14px; padding: 16px; margin: 18px 0;">
          <p style="margin: 0 0 8px;"><strong>Tarefa:</strong> {escape(task_title)}</p>
          <p style="margin: 0;"><strong>Prazo:</strong> {escape(_format_due_date(due_date))}</p>
          {f'<p style="margin: 8px 0 0;"><strong>Familia:</strong> {escape(family_name)}</p>' if family_name else ''}
        </div>
        <p>Abra o CasaSync para revisar detalhes, responsaveis e anexos.</p>
      </div>
    </div>
    """

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.smtp_sender
    message["To"] = recipient
    message.set_content(body)
    message.add_alternative(html_body, subtype="html")

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        if settings.smtp_use_tls:
            smtp.starttls()
        if settings.smtp_auth_username and settings.smtp_password:
            smtp.login(settings.smtp_auth_username, settings.smtp_password)
        smtp.send_message(message)

    return "sent"
