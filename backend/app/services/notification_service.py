import json
import logging
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.models.enums import TaskStatus
from app.models.family import Family, FamilyMember
from app.models.notification import Notification, WebPushSubscription
from app.models.task import Task, TaskReminder
from app.models.user import User
from app.schemas.notification import ReminderProcessResult, WebPushSubscriptionIn
from app.services.email_service import send_task_reminder_email
from app.services.family_service import require_family_member
from app.services.task_metrics import get_task_assignee_ids, unique_user_ids
from app.services.task_service import refresh_overdue_tasks


logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _format_due_date(value: datetime | None) -> str:
    if not value:
        return ""
    return value.strftime("%d/%m/%Y as %H:%M")


def _notification_description(task: Task) -> str:
    due = _format_due_date(task.due_date)
    return f"A tarefa {task.title} esta chegando{f' em {due}' if due else ''}. Abra o CasaSync para revisar."


def _notification_title() -> str:
    return "Lembrete de tarefa"


def list_user_notifications(db: Session, *, family_id: str, user_id: str, limit: int = 80) -> list[Notification]:
    require_family_member(db, family_id, user_id)
    return (
        db.query(Notification)
        .filter(Notification.family_id == family_id, Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .all()
    )


def _get_user_notification(db: Session, *, family_id: str, user_id: str, notification_id: str) -> Notification:
    notification = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.family_id == family_id, Notification.user_id == user_id)
        .first()
    )
    if not notification:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notificacao nao encontrada.")
    return notification


def mark_notification_read(db: Session, *, family_id: str, user_id: str, notification_id: str) -> Notification:
    notification = _get_user_notification(db, family_id=family_id, user_id=user_id, notification_id=notification_id)
    if not notification.read:
        notification.read = True
        notification.read_at = _utcnow()
        db.add(notification)
        db.commit()
        db.refresh(notification)
    return notification


def mark_all_notifications_read(db: Session, *, family_id: str, user_id: str) -> int:
    require_family_member(db, family_id, user_id)
    now = _utcnow()
    rows = (
        db.query(Notification)
        .filter(Notification.family_id == family_id, Notification.user_id == user_id, Notification.read.is_(False))
        .all()
    )
    for notification in rows:
        notification.read = True
        notification.read_at = now
    if rows:
        db.commit()
    return len(rows)


def clear_user_notifications(db: Session, *, family_id: str, user_id: str) -> int:
    require_family_member(db, family_id, user_id)
    rows = db.query(Notification).filter(Notification.family_id == family_id, Notification.user_id == user_id).all()
    count = len(rows)
    for notification in rows:
        db.delete(notification)
    if rows:
        db.commit()
    return count


def update_notification_preferences(
    db: Session,
    *,
    user: User,
    email_task_reminders_enabled: bool | None = None,
    push_task_reminders_enabled: bool | None = None,
) -> User:
    if email_task_reminders_enabled is not None:
        user.email_task_reminders_enabled = bool(email_task_reminders_enabled)
    if push_task_reminders_enabled is not None:
        user.push_task_reminders_enabled = bool(push_task_reminders_enabled)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def save_web_push_subscription(
    db: Session,
    *,
    family_id: str,
    user_id: str,
    payload: WebPushSubscriptionIn,
    user_agent: str | None = None,
) -> WebPushSubscription:
    require_family_member(db, family_id, user_id)
    subscription = db.query(WebPushSubscription).filter(WebPushSubscription.endpoint == payload.endpoint).first()
    if not subscription:
        subscription = WebPushSubscription(endpoint=payload.endpoint)
    subscription.family_id = family_id
    subscription.user_id = user_id
    subscription.p256dh = payload.keys.p256dh
    subscription.auth = payload.keys.auth
    subscription.user_agent = (user_agent or "")[:500] or None
    subscription.is_active = True
    subscription.last_seen_at = _utcnow()
    db.add(subscription)
    db.commit()
    db.refresh(subscription)
    return subscription


def disable_web_push_subscription(db: Session, *, user_id: str, endpoint: str | None = None) -> int:
    query = db.query(WebPushSubscription).filter(WebPushSubscription.user_id == user_id, WebPushSubscription.is_active.is_(True))
    if endpoint:
        query = query.filter(WebPushSubscription.endpoint == endpoint)
    rows = query.all()
    for subscription in rows:
        subscription.is_active = False
    if rows:
        db.commit()
    return len(rows)


def _push_payload(task: Task, reminder_id: str | None = None) -> str:
    return json.dumps(
        {
            "title": _notification_title(),
            "body": _notification_description(task),
            "url": "/tarefas",
            "tag": f"task-reminder-{task.id}-{reminder_id or 'legacy'}",
        }
    )


def send_task_reminder_push(db: Session, *, user_id: str, family_id: str, task: Task, reminder_id: str | None = None) -> str:
    settings = get_settings()
    if not settings.web_push_enabled:
        return "disabled"
    if not settings.web_push_configured:
        return "not_configured"

    subscriptions = (
        db.query(WebPushSubscription)
        .filter(
            WebPushSubscription.user_id == user_id,
            WebPushSubscription.family_id == family_id,
            WebPushSubscription.is_active.is_(True),
        )
        .all()
    )
    if not subscriptions:
        return "no_subscription"

    try:
        from pywebpush import WebPushException, webpush
    except Exception:
        logger.warning("Web Push enabled but pywebpush is not installed.")
        return "failed"

    delivered = False
    for subscription in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": subscription.endpoint,
                    "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
                },
                data=_push_payload(task, reminder_id),
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": settings.vapid_subject},
            )
            delivered = True
        except WebPushException as exc:
            if getattr(exc.response, "status_code", None) in {404, 410}:
                subscription.is_active = False
                db.add(subscription)
            logger.warning("Web Push delivery failed for subscription id=%s status=%s", subscription.id, getattr(exc.response, "status_code", None))
        except Exception:
            logger.warning("Web Push delivery failed for subscription id=%s", subscription.id)
    if delivered:
        return "sent"
    return "failed"


def _active_recipients(db: Session, task: Task) -> list[User]:
    candidate_ids = unique_user_ids([*get_task_assignee_ids(task), task.creator_id])
    if not candidate_ids:
        return []
    return [
        member.user
        for member in (
            db.query(FamilyMember)
            .options(selectinload(FamilyMember.user))
            .filter(FamilyMember.family_id == task.family_id, FamilyMember.user_id.in_(candidate_ids))
            .all()
        )
        if member.user and member.user.is_active
    ]


def _family_name(db: Session, family_id: str) -> str | None:
    family = db.query(Family).filter(Family.id == family_id).first()
    return family.name if family else None


def _record_email(notification: Notification, status_value: str, result: ReminderProcessResult) -> None:
    if status_value == "sent":
        notification.email_status = "sent"
        notification.email_sent_at = _utcnow()
        result.email_sent += 1
    elif status_value in {"disabled", "not_configured", "not_requested"}:
        notification.email_status = "skipped"
        result.email_skipped += 1
    else:
        notification.email_status = "failed"
        result.email_failed += 1


def _record_push(notification: Notification, status_value: str, result: ReminderProcessResult) -> None:
    if status_value == "sent":
        notification.push_status = "sent"
        notification.push_sent_at = _utcnow()
        result.push_sent += 1
    elif status_value in {"disabled", "not_configured", "no_subscription", "not_requested"}:
        notification.push_status = "skipped"
        result.push_skipped += 1
    else:
        notification.push_status = "failed"
        result.push_failed += 1


def process_due_task_reminders(db: Session, *, family_id: str | None = None, now: datetime | None = None) -> ReminderProcessResult:
    current_time = now or _utcnow()
    if family_id:
        refresh_overdue_tasks(db, family_id)

    query = (
        db.query(TaskReminder)
        .join(Task, Task.id == TaskReminder.task_id)
        .options(
            selectinload(TaskReminder.task).selectinload(Task.assignee),
            selectinload(TaskReminder.task).selectinload(Task.assignee_links),
            selectinload(TaskReminder.task).selectinload(Task.creator),
        )
        .filter(
            TaskReminder.sent.is_(False),
            TaskReminder.reminder_at <= current_time,
            Task.archived_at.is_(None),
            Task.status != TaskStatus.DONE.value,
        )
    )
    if family_id:
        query = query.filter(Task.family_id == family_id)

    due_reminders = query.order_by(TaskReminder.reminder_at.asc()).limit(100).all()
    result = ReminderProcessResult(scanned=len(due_reminders))

    for reminder in due_reminders:
        task = reminder.task
        if not task:
            reminder.sent = True
            result.skipped += 1
            continue

        recipients = _active_recipients(db, task)
        if not recipients:
            reminder.sent = True
            task.reminder_sent = all(item.sent for item in task.reminders)
            result.skipped += 1
            continue

        family_name = _family_name(db, task.family_id)
        for recipient in recipients:
            dedupe_key = f"task-reminder:{task.family_id}:{task.id}:{reminder.reminder_at.isoformat()}:{recipient.id}"
            existing = db.query(Notification).filter(Notification.dedupe_key == dedupe_key).first()
            if existing:
                result.skipped += 1
                continue

            notification = Notification(
                family_id=task.family_id,
                user_id=recipient.id,
                task_id=task.id,
                type="reminder",
                title=_notification_title(),
                description=_notification_description(task),
                dedupe_key=dedupe_key,
            )
            db.add(notification)
            db.flush()
            result.created += 1

            try:
                email_status = (
                    send_task_reminder_email(
                        recipient=recipient.email,
                        recipient_name=recipient.name,
                        task_title=task.title,
                        due_date=task.due_date,
                        family_name=family_name,
                    )
                    if recipient.email_task_reminders_enabled
                    else "not_requested"
                )
            except Exception:
                email_status = "failed"
            _record_email(notification, email_status, result)

            try:
                push_status = (
                    send_task_reminder_push(db, user_id=recipient.id, family_id=task.family_id, task=task, reminder_id=reminder.id)
                    if recipient.push_task_reminders_enabled
                    else "not_requested"
                )
            except Exception:
                push_status = "failed"
            _record_push(notification, push_status, result)

        reminder.sent = True
        task.reminder_sent = all(item.sent for item in task.reminders)
        db.add(task)
        db.add(reminder)

    if due_reminders:
        db.commit()
    legacy_result = _process_due_task_reminders_legacy(db, family_id=family_id, now=current_time)
    for field in ReminderProcessResult.model_fields:
        setattr(result, field, getattr(result, field) + getattr(legacy_result, field))
    return result


def _process_due_task_reminders_legacy(db: Session, *, family_id: str | None = None, now: datetime | None = None) -> ReminderProcessResult:
    current_time = now or _utcnow()
    query = db.query(Task).filter(
        Task.archived_at.is_(None),
        Task.reminder_enabled.is_(True),
        Task.reminder_sent.is_(False),
        Task.reminder_at.isnot(None),
        Task.reminder_at <= current_time,
        Task.status != TaskStatus.DONE.value,
        ~Task.reminders.any(),
    )
    if family_id:
        query = query.filter(Task.family_id == family_id)

    tasks = query.order_by(Task.reminder_at.asc()).limit(100).all()
    result = ReminderProcessResult(scanned=len(tasks))

    for task in tasks:
        recipients = _active_recipients(db, task)
        if not recipients:
            task.reminder_sent = True
            result.skipped += 1
            continue

        family_name = _family_name(db, task.family_id)
        for recipient in recipients:
            dedupe_key = f"task-reminder:{task.family_id}:{task.id}:{task.reminder_at.isoformat()}:{recipient.id}"
            existing = db.query(Notification).filter(Notification.dedupe_key == dedupe_key).first()
            if existing:
                result.skipped += 1
                continue

            notification = Notification(
                family_id=task.family_id,
                user_id=recipient.id,
                task_id=task.id,
                type="reminder",
                title=_notification_title(),
                description=_notification_description(task),
                dedupe_key=dedupe_key,
            )
            db.add(notification)
            db.flush()
            result.created += 1

            try:
                email_status = (
                    send_task_reminder_email(
                        recipient=recipient.email,
                        recipient_name=recipient.name,
                        task_title=task.title,
                        due_date=task.due_date,
                        family_name=family_name,
                    )
                    if recipient.email_task_reminders_enabled
                    else "not_requested"
                )
            except Exception:
                email_status = "failed"
            _record_email(notification, email_status, result)

            try:
                push_status = (
                    send_task_reminder_push(db, user_id=recipient.id, family_id=task.family_id, task=task)
                    if recipient.push_task_reminders_enabled
                    else "not_requested"
                )
            except Exception:
                push_status = "failed"
            _record_push(notification, push_status, result)

        task.reminder_sent = True
        db.add(task)

    if tasks:
        db.commit()
    return result
