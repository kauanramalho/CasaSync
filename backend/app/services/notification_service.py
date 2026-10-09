import json
import logging
import re
from datetime import datetime, timedelta, timezone
from time import monotonic
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.core.push_security import validate_push_endpoint
from app.core.rate_limit import check_rate_limit
from app.models.enums import TaskStatus
from app.models.family import Family, FamilyMember
from app.models.notification import Notification, WebPushSubscription
from app.models.image_asset import ImageAsset
from app.models.task import Task, TaskReminder
from app.models.user import User
from app.schemas.notification import ReminderProcessResult, WebPushSubscriptionIn, WebPushTestRead
from app.services.email_service import send_task_reminder_email
from app.services.family_service import require_family_member
from app.services.reminder_lock import reminder_delivery_lock
from app.services.task_metrics import unique_user_ids
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
SAO_PAULO_FALLBACK_TZ = timezone(timedelta(hours=-3), name="America/Sao_Paulo")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _format_due_date(value: datetime | None) -> str:
    if not value:
        return ""
    settings = get_settings()
    try:
        target_timezone = ZoneInfo(settings.google_calendar_default_timezone or "America/Sao_Paulo")
    except ZoneInfoNotFoundError:
        target_timezone = SAO_PAULO_FALLBACK_TZ
    aware_value = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return aware_value.astimezone(target_timezone).strftime("%d/%m/%Y as %H:%M")


def _notification_description(task: Task) -> str:
    due = _format_due_date(task.due_date)
    creator = task.creator.name if task.creator else "Um membro da familia"
    responsible = ", ".join(link.user.name[:40] for link in task.assignee_links[:3] if link.user)
    return (f'{creator} criou "{task.title}". Prazo{f": {due}" if due else " nao definido"}.'
            f'{f" Responsaveis: {responsible}." if responsible else ""} Prioridade: {task.priority}.')


def _notification_title() -> str:
    return "Lembrete de tarefa"


def list_user_notifications(db: Session, *, family_id: str, user_id: str, limit: int = 80) -> list[Notification]:
    require_family_member(db, family_id, user_id)
    rows = (
        db.query(Notification)
        .options(selectinload(Notification.task).selectinload(Task.creator))
        .filter(Notification.family_id == family_id, Notification.user_id == user_id, Notification.title != "")
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .all()
    )
    avatars = {}
    for notification in rows:
        task = notification.task
        if task and task.family_id == family_id and notification.type in {"task_created", "reminder", "overdue"}:
            if task.creator_id not in avatars:
                avatars[task.creator_id] = _creator_avatar(db, task)
            notification.creator_name = task.creator.name if task.creator else None
            notification.creator_avatar_url = avatars[task.creator_id]
    return rows


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
    rows = db.query(Notification).filter(Notification.family_id == family_id, Notification.user_id == user_id, Notification.title != "").all()
    count = len(rows)
    for notification in rows:
        # Keep event keys so clearing the inbox never re-sends a deadline alert.
        notification.title = ""
        notification.description = None
        notification.read = True
        notification.read_at = _utcnow()
        if notification.push_status in {"pending", "retry"}:
            notification.push_status = "skipped"
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
    if subscription and subscription.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Esta inscricao pertence a outra conta. Reative as notificacoes neste navegador.")
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


def has_active_web_push_subscription(db: Session, *, user_id: str) -> bool:
    return (
        db.query(WebPushSubscription.id)
        .filter(WebPushSubscription.user_id == user_id, WebPushSubscription.is_active.is_(True))
        .first()
        is not None
    )


def is_device_push_subscription_active(db: Session, *, user_id: str, family_id: str,
                                       payload: WebPushSubscriptionIn) -> bool:
    return _get_device_push_subscription(db, user_id=user_id, family_id=family_id, payload=payload) is not None


def _get_device_push_subscription(db: Session, *, user_id: str, family_id: str,
                                 payload: WebPushSubscriptionIn) -> WebPushSubscription | None:
    require_family_member(db, family_id, user_id)
    return db.query(WebPushSubscription).filter(
        WebPushSubscription.user_id == user_id,
        WebPushSubscription.family_id == family_id,
        WebPushSubscription.endpoint == payload.endpoint,
        WebPushSubscription.p256dh == payload.keys.p256dh,
        WebPushSubscription.auth == payload.keys.auth,
        WebPushSubscription.is_active.is_(True),
    ).first()


def _creator_avatar(db: Session, task: Task) -> str | None:
    """Only existing, owned CasaSync avatar uploads; never third-party fetches."""
    creator = task.creator
    if not creator or not creator.is_active or not creator.avatar_url:
        return None
    if not db.query(FamilyMember.id).filter_by(family_id=task.family_id, user_id=creator.id).first():
        return None
    try:
        url = urlsplit(creator.avatar_url)
        match = re.fullmatch(r"/api/uploads/images/([0-9a-f-]{36})", url.path)
        if (url.scheme != "https" or url.netloc != "casasync-api.onrender.com"
                or url.query or url.fragment or not match):
            return None
        asset = db.query(ImageAsset.id).filter_by(id=match[1], owner_user_id=creator.id, scope="avatar").first()
        return creator.avatar_url if asset else None
    except ValueError:
        return None


def _push_payload(task: Task, reminder_id: str | None = None, *, avatar_url: str | None = None) -> str:
    return json.dumps(
        {
            "title": _notification_title(),
            "body": _notification_description(task),
            "url": "/tarefas",
            "tag": f"task-reminder-{task.id}-{reminder_id or 'legacy'}",
            "taskId": task.id,
            "avatarUrl": avatar_url,
            "timestamp": int(_utcnow().timestamp() * 1000),
        }, ensure_ascii=False,
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

    return _send_push_to_subscriptions(db, subscriptions, data=_push_payload(task, reminder_id, avatar_url=_creator_avatar(db, task)))


def _send_push_to_subscriptions(db: Session, subscriptions: list[WebPushSubscription],
                                *, data: str, ttl: int = 3600) -> str:
    settings = get_settings()
    try:
        from pywebpush import WebPushException, webpush
    except Exception:
        logger.warning("Web Push enabled but pywebpush is not installed.")
        return "failed"

    delivered = False
    for subscription in subscriptions:
        try:
            # Existing database rows must also pass validation before network I/O.
            validate_push_endpoint(subscription.endpoint)
            webpush(
                subscription_info={
                    "endpoint": subscription.endpoint,
                    "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
                },
                data=data,
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": settings.vapid_subject},
                # TTL=0 (library default) drops messages for unavailable devices.
                # Keep reminders briefly for offline/idle phones, not indefinitely.
                ttl=ttl,
                headers={"Urgency": "high"},
                timeout=20,
            )
            delivered = True
        except WebPushException as exc:
            if getattr(exc.response, "status_code", None) in {404, 410}:
                subscription.is_active = False
                db.add(subscription)
            logger.warning("Web Push delivery failed for subscription id=%s status=%s", subscription.id, getattr(exc.response, "status_code", None))
        except Exception as exc:
            # Class only: exception bodies can contain keys/provider responses.
            logger.warning("Web Push delivery failed for subscription id=%s error_type=%s", subscription.id, type(exc).__name__)
    if delivered:
        return "sent"
    return "failed"


def send_device_test_push(db: Session, *, user: User, family_id: str,
                          payload: WebPushSubscriptionIn) -> WebPushTestRead:
    settings = get_settings()
    if not settings.web_push_enabled or not settings.web_push_configured:
        raise HTTPException(status_code=400, detail="Notificacoes do navegador estao desativadas ou nao configuradas.")
    subscription = _get_device_push_subscription(db, user_id=user.id, family_id=family_id, payload=payload)
    if not user.push_task_reminders_enabled or not subscription:
        raise HTTPException(status_code=409, detail="Ative este dispositivo para a familia atual antes de testar.")
    # One attempt per account/minute across devices and families. Same-minute tag
    # also replaces duplicates at the device. No tasks or inbox records created.
    check_rate_limit(f"push-test:{user.id}", limit=1, window_seconds=60)
    now = _utcnow()
    data = json.dumps({
        "title": "Teste de notificacao CasaSync",
        "body": "Se este alerta apareceu, este aparelho recebeu o teste. Abra o CasaSync para continuar.",
        "url": "/configuracoes",
        "tag": f"casasync-push-test-{int(now.timestamp()) // 60}",
        "timestamp": int(now.timestamp() * 1000),
    })
    result = _send_push_to_subscriptions(db, [subscription], data=data, ttl=300)
    # Persist provider-expired registrations even when the attempt fails.
    db.commit()
    if result != "sent":
        raise HTTPException(status_code=502, detail="Nao foi possivel enviar o teste. Reative este dispositivo e tente novamente em um minuto.")
    return WebPushTestRead(accepted=True, message=(
        "Teste aceito pelo provedor. Confira a notificacao neste aparelho; o envio nao confirma a exibicao do balao. Aguarde um minuto para repetir."
    ))


def _active_recipients(db: Session, task: Task) -> list[User]:
    # A corrupt/legacy task must not broadcast across a family its creator left.
    if not db.query(FamilyMember.id).filter_by(family_id=task.family_id, user_id=task.creator_id).first():
        return []
    return [
        member.user
        for member in (
            db.query(FamilyMember)
            .options(selectinload(FamilyMember.user))
            .filter(FamilyMember.family_id == task.family_id)
            .all()
        )
        if member.user and member.user.is_active
    ]


def create_task_created_notifications(db: Session, *, task: Task) -> int:
    """Persist event + push intent in the same transaction as task creation."""
    if task.status == TaskStatus.DONE.value:
        return 0
    # Assignee links are new objects; persist them before their user relationship
    # is read for the creation snapshot (SessionLocal disables autoflush).
    db.flush()
    created = 0
    for recipient in _active_recipients(db, task):
        key = f"task-created:{task.family_id}:{task.id}:{recipient.id}"
        if db.query(Notification.id).filter_by(dedupe_key=key).first():
            continue
        db.add(Notification(family_id=task.family_id, user_id=recipient.id, task_id=task.id,
                            type="task_created", title=f"{task.creator.name[:100]} criou uma tarefa",
                            description=_notification_description(task), dedupe_key=key,
                            push_status="pending" if recipient.push_task_reminders_enabled else "skipped"))
        created += 1
    db.flush()
    return created


def create_task_assignment_notifications(
    db: Session,
    *,
    task: Task,
    assignee_ids: list[str],
    actor_id: str,
    event_key: str,
) -> int:
    recipient_ids = [user_id for user_id in unique_user_ids(assignee_ids) if user_id != actor_id]
    if not recipient_ids:
        return 0

    actor = db.get(User, actor_id)
    actor_name = actor.name if actor else "Um membro da familia"
    recipients = [
        member.user
        for member in (
            db.query(FamilyMember)
            .options(selectinload(FamilyMember.user))
            .filter(FamilyMember.family_id == task.family_id, FamilyMember.user_id.in_(recipient_ids))
            .all()
        )
        if member.user and member.user.is_active
    ]

    created = 0
    for recipient in recipients:
        dedupe_key = f"task-assigned:{task.family_id}:{task.id}:{recipient.id}:{event_key}"
        if db.query(Notification.id).filter(Notification.dedupe_key == dedupe_key).first():
            continue
        db.add(
            Notification(
                family_id=task.family_id,
                user_id=recipient.id,
                task_id=task.id,
                type="task_assigned",
                title="Nova tarefa para voce",
                description=f'{actor_name} atribuiu "{task.title}" a voce.',
                dedupe_key=dedupe_key,
                push_status="pending" if recipient.push_task_reminders_enabled else "skipped",
            )
        )
        created += 1
    return created


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


def process_due_task_reminders(
    db: Session, *, family_id: str | None = None, now: datetime | None = None,
    batch_limit: int = 100, max_duration_seconds: float | None = None,
) -> ReminderProcessResult:
    with reminder_delivery_lock(db) as acquired:
        if not acquired:
            return ReminderProcessResult()
        deadline = monotonic() + max_duration_seconds if max_duration_seconds is not None else None
        result = _process_due_task_reminders(db, family_id=family_id, now=now,
                                            batch_limit=batch_limit, deadline=deadline)
        overdue = _process_expired_tasks(db, family_id=family_id, now=now,
                                        batch_limit=max(0, batch_limit - result.scanned), deadline=deadline)
        _merge_result(result, overdue)
        pending = _deliver_pending_task_push(db, family_id=family_id,
                                            batch_limit=batch_limit, deadline=deadline, now=now)
        _merge_result(result, pending)
        return result


def _merge_result(result: ReminderProcessResult, other: ReminderProcessResult) -> None:
    for field in ReminderProcessResult.model_fields:
        setattr(result, field, getattr(result, field) + getattr(other, field))


def deliver_task_events_in_background(family_id: str) -> None:
    """Fresh session after HTTP response; no provider delay in task creation."""
    from app.database.session import SessionLocal

    try:
        with SessionLocal() as db, reminder_delivery_lock(db) as acquired:
            if acquired:
                _deliver_pending_task_push(db, family_id=family_id, batch_limit=25,
                                           deadline=monotonic() + 45)
    except Exception as exc:
        # Durable pending events can be picked up by the scheduler after a crash.
        logger.warning("Task event dispatch failed error_type=%s", type(exc).__name__)


def _deliver_pending_task_push(db: Session, *, family_id: str | None = None,
                               batch_limit: int = 25, deadline: float | None = None,
                               now: datetime | None = None) -> ReminderProcessResult:
    result = ReminderProcessResult()
    query = db.query(Notification).filter(
        Notification.type.in_(["task_created", "task_assigned", "overdue", "reminder"]),
        or_(Notification.push_status == "pending",
            (Notification.push_status == "retry") & (Notification.updated_at <= _utcnow() - timedelta(minutes=1))),
    )
    if family_id:
        query = query.filter(Notification.family_id == family_id)
    for notification in query.order_by(Notification.created_at).limit(batch_limit).all():
        if deadline is not None and monotonic() >= deadline:
            break
        task = db.get(Task, notification.task_id)
        user = db.get(User, notification.user_id)
        created_at = notification.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        if (not task or task.family_id != notification.family_id or task.archived_at
                or task.status == TaskStatus.DONE.value or not user or not user.is_active
                or not user.push_task_reminders_enabled
                or not db.query(FamilyMember.id).filter_by(family_id=notification.family_id, user_id=user.id).first()
                or not _active_recipients(db, task)
                or created_at < _utcnow() - timedelta(days=1)):
            notification.push_status = "skipped"
            result.push_skipped += 1
            db.commit()
            continue
        current_time = now or _utcnow()
        if notification.type == "overdue":
            due = task.due_date
            aware_due = due.replace(tzinfo=timezone.utc) if due and due.tzinfo is None else due
            if not due or aware_due > current_time or f":{due.isoformat()}:" not in notification.dedupe_key:
                notification.push_status = "skipped"
                result.push_skipped += 1
                db.commit()
                continue
        if notification.type == "reminder":
            dates = [r.reminder_at for r in task.reminders] or ([task.reminder_at] if task.reminder_at else [])
            if not any(f":{date.isoformat()}:" in notification.dedupe_key for date in dates):
                notification.push_status = "skipped"
                result.push_skipped += 1
                db.commit()
                continue
        previous_status = notification.push_status
        data = json.loads(_push_payload(task, notification.id, avatar_url=_creator_avatar(db, task)))
        data.update(title=notification.title, body=notification.description)
        if notification.type != "reminder":
            data["tag"] = f"casasync-event-{notification.id}"
        settings = get_settings()
        subscriptions = db.query(WebPushSubscription).filter_by(
            user_id=user.id, family_id=notification.family_id, is_active=True).all()
        try:
            status_value = ("disabled" if not settings.web_push_enabled else
                            "not_configured" if not settings.web_push_configured else
                            "no_subscription" if not subscriptions else
                            _send_push_to_subscriptions(db, subscriptions, data=json.dumps(data, ensure_ascii=False)))
        except Exception:
            status_value = "failed"
        _record_push(notification, status_value, result)
        if notification.push_status == "failed" and previous_status == "pending":
            notification.push_status = "retry"
        db.commit()
    if result.push_sent or result.push_skipped or result.push_failed:
        # Recipient-level provider acceptance, not a device display receipt.
        # No task titles, identities, images, endpoints or provider bodies.
        logger.info("Task push batch recipient_accepted=%d skipped=%d failed=%d",
                    result.push_sent, result.push_skipped, result.push_failed)
    return result


def _process_expired_tasks(db: Session, *, family_id: str | None, now: datetime | None,
                           batch_limit: int, deadline: float | None) -> ReminderProcessResult:
    """One deadline event per task/family. Catch up one day, not years of history."""
    current_time = now or _utcnow()
    already_warned = db.query(Notification.id).filter(
        Notification.task_id == Task.id, Notification.family_id == Task.family_id,
        Notification.type == "overdue", Notification.created_at >= Task.due_date,
    ).exists()
    query = db.query(Task).filter(Task.due_date <= current_time,
        Task.due_date >= current_time - timedelta(days=1), Task.archived_at.is_(None),
        Task.status != TaskStatus.DONE.value, ~already_warned,
        db.query(FamilyMember.id).filter(FamilyMember.family_id == Task.family_id,
                                        FamilyMember.user_id == Task.creator_id).exists(),
        db.query(FamilyMember.id).join(User, User.id == FamilyMember.user_id).filter(
            FamilyMember.family_id == Task.family_id, User.is_active.is_(True)).exists())
    if family_id:
        query = query.filter(Task.family_id == family_id)
    result = ReminderProcessResult()
    for task in query.order_by(Task.due_date).limit(batch_limit).all():
        if deadline is not None and monotonic() >= deadline:
            break
        result.scanned += 1
        for recipient in _active_recipients(db, task):
            key = f"task-overdue:{task.family_id}:{task.id}:{task.due_date.isoformat()}:{recipient.id}"
            if db.query(Notification.id).filter_by(dedupe_key=key).first():
                continue
            db.add(Notification(family_id=task.family_id, user_id=recipient.id, task_id=task.id,
                                type="overdue", title="Prazo da tarefa venceu",
                                description=_notification_description(task), dedupe_key=key,
                                created_at=current_time,
                                push_status="pending" if recipient.push_task_reminders_enabled else "skipped"))
            result.created += 1
        db.commit()
    return result


def _process_due_task_reminders(
    db: Session, *, family_id: str | None = None, now: datetime | None = None,
    batch_limit: int = 100, deadline: float | None = None,
) -> ReminderProcessResult:
    from app.services.task_service import refresh_overdue_tasks

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

    due_reminders = query.order_by(TaskReminder.reminder_at.asc()).limit(batch_limit).all()
    result = ReminderProcessResult()

    for reminder in due_reminders:
        if deadline is not None and monotonic() >= deadline:
            break
        result.scanned += 1
        task = reminder.task
        if not task:
            reminder.sent = True
            result.skipped += 1
            db.commit()
            continue

        recipients = _active_recipients(db, task)
        if not recipients:
            reminder.sent = True
            task.reminder_sent = all(item.sent for item in task.reminders)
            result.skipped += 1
            db.commit()
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
                    send_task_reminder_push(db, user_id=recipient.id, family_id=task.family_id, task=task, reminder_id=notification.id)
                    if recipient.push_task_reminders_enabled
                    else "not_requested"
                )
            except Exception:
                push_status = "failed"
            _record_push(notification, push_status, result)
            if notification.push_status == "failed":
                notification.push_status = "retry"

        reminder.sent = True
        task.reminder_sent = all(item.sent for item in task.reminders)
        db.add(task)
        db.add(reminder)
        # Keep progress durable if a later reminder or provider fails.
        db.commit()

    remaining = max(0, batch_limit - result.scanned)
    legacy_result = _process_due_task_reminders_legacy(db, family_id=family_id, now=current_time,
                                                      batch_limit=remaining, deadline=deadline)
    for field in ReminderProcessResult.model_fields:
        setattr(result, field, getattr(result, field) + getattr(legacy_result, field))
    return result


def _process_due_task_reminders_legacy(
    db: Session, *, family_id: str | None = None, now: datetime | None = None,
    batch_limit: int = 100, deadline: float | None = None,
) -> ReminderProcessResult:
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

    tasks = query.order_by(Task.reminder_at.asc()).limit(batch_limit).all()
    result = ReminderProcessResult()

    for task in tasks:
        if deadline is not None and monotonic() >= deadline:
            break
        result.scanned += 1
        recipients = _active_recipients(db, task)
        if not recipients:
            task.reminder_sent = True
            result.skipped += 1
            db.commit()
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
                    send_task_reminder_push(db, user_id=recipient.id, family_id=task.family_id, task=task, reminder_id=notification.id)
                    if recipient.push_task_reminders_enabled
                    else "not_requested"
                )
            except Exception:
                push_status = "failed"
            _record_push(notification, push_status, result)
            if notification.push_status == "failed":
                notification.push_status = "retry"

        task.reminder_sent = True
        db.add(task)
        db.commit()

    return result
