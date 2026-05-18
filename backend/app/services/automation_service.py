from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import logging
import unicodedata
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.family import FamilyMember
from app.models.task import Task
from app.models.user import User
from app.schemas.automation import (
    AutomationDuplicateRead,
    AutomationTaskInput,
    AutomationTaskOperationResponse,
    AutomationTaskRescheduleInput,
    AutomationTaskResult,
    AutomationTasksResponse,
    AutomationTaskUpdateInput,
)
from app.schemas.task import TaskCreate, TaskUpdate
from app.services.category_service import ensure_default_categories, get_category_by_name
from app.services.family_service import require_family_member
from app.services.task_service import create_task, delete_task, get_task, update_task


logger = logging.getLogger("casasync.automation")


@dataclass
class PreparedAutomationTask:
    index: int
    payload: AutomationTaskInput
    assignee_id: str
    category_id: str
    due_date: datetime


def _automation_error(status_code: int, index: int, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"index": index, "message": message})


def _normalize_lookup(value: str | None) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    return "".join(char for char in normalized if not unicodedata.combining(char)).strip().lower()


def _resolve_assignee(db: Session, family_id: str, payload: AutomationTaskInput | AutomationTaskUpdateInput, index: int) -> User:
    if payload.responsible_id:
        require_family_member(db, family_id, payload.responsible_id)
        user = db.query(User).filter(User.id == payload.responsible_id, User.is_active.is_(True)).first()
        if not user:
            raise _automation_error(status.HTTP_404_NOT_FOUND, index, "Responsavel nao encontrado ou inativo.")
        return user

    needle = (payload.responsible or "").strip().lower()
    matches = (
        db.query(User)
        .join(FamilyMember, FamilyMember.user_id == User.id)
        .filter(
            FamilyMember.family_id == family_id,
            User.is_active.is_(True),
            or_(
                func.lower(User.name) == needle,
                func.lower(User.username) == needle,
                func.lower(User.email) == needle,
            ),
        )
        .all()
    )
    if not matches:
        normalized_needle = _normalize_lookup(payload.responsible)
        fallback_matches = (
            db.query(User)
            .join(FamilyMember, FamilyMember.user_id == User.id)
            .filter(FamilyMember.family_id == family_id, User.is_active.is_(True))
            .all()
        )
        matches = [
            user
            for user in fallback_matches
            if normalized_needle in {_normalize_lookup(user.name), _normalize_lookup(user.username), _normalize_lookup(user.email)}
        ]
    if not matches:
        raise _automation_error(status.HTTP_404_NOT_FOUND, index, f"Responsavel '{payload.responsible}' nao existe nesta familia.")
    if len(matches) > 1:
        raise _automation_error(status.HTTP_409_CONFLICT, index, f"Responsavel '{payload.responsible}' e ambiguo. Use responsible_id.")
    return matches[0]


def _resolve_category(db: Session, family_id: str, payload: AutomationTaskInput | AutomationTaskUpdateInput, index: int) -> Category:
    ensure_default_categories(db, family_id)
    if payload.category_id:
        category = db.query(Category).filter(Category.id == payload.category_id, Category.family_id == family_id).first()
    else:
        category = get_category_by_name(db, family_id, payload.category or "")
        if not category:
            normalized_category = _normalize_lookup(payload.category)
            category = next(
                (
                    item
                    for item in db.query(Category).filter(Category.family_id == family_id).all()
                    if _normalize_lookup(item.name) == normalized_category
                ),
                None,
            )
    if not category:
        label = payload.category_id or payload.category
        raise _automation_error(status.HTTP_404_NOT_FOUND, index, f"Categoria '{label}' nao existe nesta familia.")
    return category


def _build_due_date(payload: AutomationTaskInput | AutomationTaskUpdateInput | AutomationTaskRescheduleInput, index: int) -> datetime:
    try:
        local_zone = ZoneInfo(payload.timezone)
    except ZoneInfoNotFoundError as exc:
        raise _automation_error(status.HTTP_422_UNPROCESSABLE_ENTITY, index, f"Timezone invalido: {payload.timezone}") from exc

    local_due_date = datetime.combine(payload.date, payload.time).replace(tzinfo=local_zone)
    return local_due_date.astimezone(timezone.utc).replace(second=0, microsecond=0)


def _find_duplicate(db: Session, prepared: PreparedAutomationTask, family_id: str) -> Task | None:
    if prepared.payload.external_id:
        existing_by_external_id = (
            db.query(Task)
            .filter(
                Task.family_id == family_id,
                Task.automation_source == prepared.payload.source,
                Task.automation_external_id == prepared.payload.external_id,
            )
            .order_by(Task.created_at.asc())
            .first()
        )
        if existing_by_external_id:
            return existing_by_external_id

    return (
        db.query(Task)
        .filter(
            Task.family_id == family_id,
            Task.archived_at.is_(None),
            Task.assignee_id == prepared.assignee_id,
            Task.due_date >= prepared.due_date,
            Task.due_date < prepared.due_date + timedelta(minutes=1),
            Task.task_type == prepared.payload.task_type.value,
            func.lower(func.trim(Task.title)) == prepared.payload.title.strip().lower(),
        )
        .order_by(Task.created_at.asc())
        .first()
    )


def _duplicate_key(prepared: PreparedAutomationTask) -> tuple[str, str, str, str]:
    if prepared.payload.external_id:
        return ("external_id", prepared.payload.source, prepared.payload.external_id, "")
    return (
        prepared.payload.title.strip().lower(),
        prepared.assignee_id,
        prepared.due_date.isoformat(),
        prepared.payload.task_type.value,
    )


def _error_message(exc: HTTPException) -> str:
    if isinstance(exc.detail, dict):
        return str(exc.detail.get("message") or exc.detail)
    return str(exc.detail)


def _operation_response(
    *,
    request_id: str,
    action: str,
    task_id: str,
    message: str,
    task: Task | None = None,
) -> AutomationTaskOperationResponse:
    return AutomationTaskOperationResponse(
        request_id=request_id,
        action=action,
        task_id=task_id,
        message=message,
        task=task,
    )


def create_automation_tasks(
    db: Session,
    family_id: str,
    creator_id: str,
    items: list[AutomationTaskInput],
) -> AutomationTasksResponse:
    request_id = uuid4().hex
    if not items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Envie pelo menos um item para automacao.")
    if len(items) > 50:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Envie no maximo 50 itens por requisicao.")

    require_family_member(db, family_id, creator_id)

    created_tasks = []
    skipped_duplicates: list[AutomationDuplicateRead] = []
    results: list[AutomationTaskResult] = []
    created_by_key: dict[tuple[str, str, str, str], str] = {}

    logger.info(
        "automation_batch_started",
        extra={"request_id": request_id, "family_id": family_id, "creator_id": creator_id, "total_received": len(items)},
    )

    for index, item in enumerate(items):
        try:
            prepared = PreparedAutomationTask(
                index=index,
                payload=item,
                assignee_id=_resolve_assignee(db, family_id, item, index).id,
                category_id=_resolve_category(db, family_id, item, index).id,
                due_date=_build_due_date(item, index),
            )
        except IntegrityError:
            db.rollback()
            existing_after_conflict = _find_duplicate(db, prepared, family_id)
            duplicate = AutomationDuplicateRead(
                index=prepared.index,
                title=prepared.payload.title,
                existing_task_id=existing_after_conflict.id if existing_after_conflict else None,
                external_id=prepared.payload.external_id,
                reason="Outro item igual foi criado antes desta gravacao ser concluida.",
            )
            skipped_duplicates.append(duplicate)
            results.append(
                AutomationTaskResult(
                    index=prepared.index,
                    action="skipped_duplicate",
                    task_id=duplicate.existing_task_id,
                    external_id=prepared.payload.external_id,
                    title=prepared.payload.title,
                    message=duplicate.reason,
                    task=existing_after_conflict,
                )
            )
            logger.warning("automation_item_duplicate_conflict", extra={"request_id": request_id, "index": prepared.index})
            continue
        except HTTPException as exc:
            message = _error_message(exc)
            results.append(
                AutomationTaskResult(
                    index=index,
                    action="failed",
                    external_id=item.external_id,
                    title=item.title,
                    message=message,
                )
            )
            logger.warning("automation_item_failed", extra={"request_id": request_id, "index": index, "message": message})
            continue

        key = _duplicate_key(prepared)
        if key in created_by_key:
            duplicate = AutomationDuplicateRead(
                index=prepared.index,
                title=prepared.payload.title,
                existing_task_id=created_by_key[key],
                external_id=prepared.payload.external_id,
                reason="Duplicado na mesma requisicao.",
            )
            skipped_duplicates.append(duplicate)
            results.append(
                AutomationTaskResult(
                    index=prepared.index,
                    action="skipped_duplicate",
                    task_id=duplicate.existing_task_id,
                    external_id=prepared.payload.external_id,
                    title=prepared.payload.title,
                    message=duplicate.reason,
                )
            )
            continue

        existing = _find_duplicate(db, prepared, family_id)
        if existing:
            duplicate = AutomationDuplicateRead(
                index=prepared.index,
                title=prepared.payload.title,
                existing_task_id=existing.id,
                external_id=prepared.payload.external_id,
                reason="Ja existe uma tarefa igual para esta familia, responsavel, data, horario e tipo.",
            )
            skipped_duplicates.append(duplicate)
            results.append(
                AutomationTaskResult(
                    index=prepared.index,
                    action="skipped_duplicate",
                    task_id=existing.id,
                    external_id=prepared.payload.external_id,
                    title=prepared.payload.title,
                    message=duplicate.reason,
                    task=existing,
                )
            )
            continue

        try:
            created = create_task(
                db,
                family_id,
                creator_id,
                TaskCreate(
                    title=prepared.payload.title,
                    description=prepared.payload.description,
                    assignee_id=prepared.assignee_id,
                    category_id=prepared.category_id,
                    due_date=prepared.due_date,
                    priority=prepared.payload.priority,
                    status=prepared.payload.status,
                    task_type=prepared.payload.task_type,
                    automation_source=prepared.payload.source,
                    automation_external_id=prepared.payload.external_id,
                    automation_source_label=prepared.payload.source_label,
                    automation_source_reference=prepared.payload.source_reference,
                    recurrence_rule=prepared.payload.recurrence_rule,
                    reminder_enabled=prepared.payload.reminder_enabled,
                    reminder_value=prepared.payload.reminder_value,
                    reminder_unit=prepared.payload.reminder_unit,
                ),
            )
        except HTTPException as exc:
            message = _error_message(exc)
            results.append(
                AutomationTaskResult(
                    index=prepared.index,
                    action="failed",
                    external_id=prepared.payload.external_id,
                    title=prepared.payload.title,
                    message=message,
                )
            )
            logger.warning("automation_item_failed", extra={"request_id": request_id, "index": prepared.index, "message": message})
            continue
        created_tasks.append(created)
        created_by_key[key] = created.id
        results.append(
            AutomationTaskResult(
                index=prepared.index,
                action="created",
                task_id=created.id,
                external_id=prepared.payload.external_id,
                title=created.title,
                message="Item criado no CasaSync.",
                task=created,
            )
        )
        logger.info(
            "automation_item_created",
            extra={"request_id": request_id, "index": prepared.index, "task_id": created.id, "external_id": prepared.payload.external_id},
        )

    total_failed = sum(1 for item in results if item.action == "failed")
    logger.info(
        "automation_batch_finished",
        extra={
            "request_id": request_id,
            "total_created": len(created_tasks),
            "total_skipped": len(skipped_duplicates),
            "total_failed": total_failed,
        },
    )

    return AutomationTasksResponse(
        request_id=request_id,
        total_received=len(items),
        total_created=len(created_tasks),
        total_skipped=len(skipped_duplicates),
        total_failed=total_failed,
        created_tasks=created_tasks,
        skipped_duplicates=skipped_duplicates,
        results=results,
    )


def update_automation_task(
    db: Session,
    family_id: str,
    task_id: str,
    payload: AutomationTaskUpdateInput,
) -> AutomationTaskOperationResponse:
    request_id = uuid4().hex
    get_task(db, family_id, task_id)
    data = payload.model_dump(exclude_unset=True)
    update_data: dict = {}

    direct_fields = [
        "title",
        "description",
        "priority",
        "status",
        "task_type",
        "reminder_enabled",
        "reminder_value",
        "reminder_unit",
        "recurrence_rule",
    ]
    for field in direct_fields:
        if field in data:
            update_data[field] = data[field]

    if payload.date is not None and payload.time is not None:
        update_data["due_date"] = _build_due_date(payload, 0)
    if payload.responsible or payload.responsible_id:
        update_data["assignee_id"] = _resolve_assignee(db, family_id, payload, 0).id
    if payload.category or payload.category_id:
        update_data["category_id"] = _resolve_category(db, family_id, payload, 0).id
    if "external_id" in data:
        update_data["automation_external_id"] = payload.external_id
    if "source" in data:
        update_data["automation_source"] = payload.source
    if "source_label" in data:
        update_data["automation_source_label"] = payload.source_label
    if "source_reference" in data:
        update_data["automation_source_reference"] = payload.source_reference

    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Envie ao menos um campo para atualizar.")

    updated = update_task(db, family_id, task_id, TaskUpdate(**update_data))
    logger.info("automation_task_updated", extra={"request_id": request_id, "task_id": task_id, "family_id": family_id})
    return _operation_response(
        request_id=request_id,
        action="updated",
        task_id=updated.id,
        message="Item atualizado no CasaSync.",
        task=updated,
    )


def reschedule_automation_task(
    db: Session,
    family_id: str,
    task_id: str,
    payload: AutomationTaskRescheduleInput,
) -> AutomationTaskOperationResponse:
    request_id = uuid4().hex
    get_task(db, family_id, task_id)
    update_data = {"due_date": _build_due_date(payload, 0)}
    if payload.source_reference is not None:
        update_data["automation_source_reference"] = payload.source_reference
    updated = update_task(db, family_id, task_id, TaskUpdate(**update_data))
    logger.info("automation_task_rescheduled", extra={"request_id": request_id, "task_id": task_id, "family_id": family_id})
    return _operation_response(
        request_id=request_id,
        action="rescheduled",
        task_id=updated.id,
        message="Item remarcado no CasaSync.",
        task=updated,
    )


def cancel_automation_task(db: Session, family_id: str, task_id: str) -> AutomationTaskOperationResponse:
    request_id = uuid4().hex
    task = get_task(db, family_id, task_id)
    delete_task(db, family_id, task_id)
    logger.info("automation_task_cancelled", extra={"request_id": request_id, "task_id": task_id, "family_id": family_id})
    return _operation_response(
        request_id=request_id,
        action="cancelled",
        task_id=task.id,
        message="Item cancelado e removido do CasaSync.",
        task=None,
    )
