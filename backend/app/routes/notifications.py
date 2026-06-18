from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import get_current_user, get_family_id
from app.database.session import get_db
from app.models.user import User
from app.schemas.notification import (
    NotificationPreferencesUpdate,
    NotificationRead,
    NotificationSettingsRead,
    ReminderProcessResult,
    WebPushSubscriptionIn,
    WebPushSubscriptionStatus,
)
from app.services.notification_service import (
    clear_user_notifications,
    disable_web_push_subscription,
    has_active_web_push_subscription,
    list_user_notifications,
    mark_all_notifications_read,
    mark_notification_read,
    process_due_task_reminders,
    save_web_push_subscription,
    update_notification_preferences,
)


router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationRead])
def list_notifications(
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    return list_user_notifications(db, family_id=family_id, user_id=current_user.id)


@router.patch("/{notification_id}/read", response_model=NotificationRead)
def read_notification(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    return mark_notification_read(db, family_id=family_id, user_id=current_user.id, notification_id=notification_id)


@router.post("/read-all")
def read_all_notifications(
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    return {"updated": mark_all_notifications_read(db, family_id=family_id, user_id=current_user.id)}


@router.delete("")
def clear_notifications(
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    return {"deleted": clear_user_notifications(db, family_id=family_id, user_id=current_user.id)}


@router.get("/settings", response_model=NotificationSettingsRead)
def notification_settings(current_user: User = Depends(get_current_user)):
    settings = get_settings()
    return NotificationSettingsRead(
        email_feature_enabled=settings.email_notifications_enabled,
        email_configured=settings.smtp_configured,
        email_task_reminders_enabled=current_user.email_task_reminders_enabled,
        push_feature_enabled=settings.web_push_enabled,
        push_configured=settings.web_push_configured,
        push_task_reminders_enabled=current_user.push_task_reminders_enabled,
        vapid_public_key=settings.vapid_public_key if settings.web_push_enabled else None,
    )


@router.patch("/preferences", response_model=NotificationSettingsRead)
def update_preferences(
    payload: NotificationPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    settings = get_settings()
    if payload.email_task_reminders_enabled is True and (
        not settings.email_notifications_enabled or not settings.smtp_configured
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Notificacoes por email estao desativadas ou nao configuradas.",
        )
    if payload.push_task_reminders_enabled is True and (
        not settings.web_push_enabled or not settings.web_push_configured
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Notificacoes do navegador estao desativadas ou nao configuradas.",
        )
    updated = update_notification_preferences(
        db,
        user=current_user,
        email_task_reminders_enabled=payload.email_task_reminders_enabled,
        push_task_reminders_enabled=payload.push_task_reminders_enabled,
    )
    return NotificationSettingsRead(
        email_feature_enabled=settings.email_notifications_enabled,
        email_configured=settings.smtp_configured,
        email_task_reminders_enabled=updated.email_task_reminders_enabled,
        push_feature_enabled=settings.web_push_enabled,
        push_configured=settings.web_push_configured,
        push_task_reminders_enabled=updated.push_task_reminders_enabled,
        vapid_public_key=settings.vapid_public_key if settings.web_push_enabled else None,
    )


@router.post("/push-subscriptions", response_model=WebPushSubscriptionStatus)
def save_push_subscription(
    payload: WebPushSubscriptionIn,
    request: Request,
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    settings = get_settings()
    if not settings.web_push_enabled or not settings.web_push_configured:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Notificacoes do navegador estao desativadas ou nao configuradas.",
        )
    save_web_push_subscription(
        db,
        family_id=family_id,
        user_id=current_user.id,
        payload=payload,
        user_agent=request.headers.get("user-agent"),
    )
    update_notification_preferences(db, user=current_user, push_task_reminders_enabled=True)
    return WebPushSubscriptionStatus(enabled=True, message="Notificacoes do navegador ativadas neste dispositivo.")


@router.delete("/push-subscriptions", response_model=WebPushSubscriptionStatus)
def delete_push_subscription(
    payload: WebPushSubscriptionIn | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    disable_web_push_subscription(db, user_id=current_user.id, endpoint=payload.endpoint if payload else None)
    still_enabled = has_active_web_push_subscription(db, user_id=current_user.id)
    update_notification_preferences(db, user=current_user, push_task_reminders_enabled=still_enabled)
    message = (
        "Notificacoes desativadas neste dispositivo. Os outros dispositivos continuam ativos."
        if still_enabled
        else "Notificacoes do navegador desativadas."
    )
    return WebPushSubscriptionStatus(enabled=still_enabled, message=message)


@router.post("/reminders/process", response_model=ReminderProcessResult)
def process_reminders(
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    # Auth + active-family dependency above protects this endpoint from public cron abuse.
    _ = current_user
    return process_due_task_reminders(db, family_id=family_id)
