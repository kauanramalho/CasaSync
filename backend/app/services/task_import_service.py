from datetime import datetime, time, timezone

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.category import Category
from app.models.enums import TaskPriority, TaskStatus, TaskType
from app.models.family import FamilyMember
from app.models.task import Task
from app.schemas.task import TaskCreate
from app.schemas.task_import import (
    FailedTaskImportResult,
    ImportedTaskResult,
    TaskSuggestionImportItem,
    TaskSuggestionsImportResponse,
)
from app.services.family_service import require_family_member
from app.services.task_metrics import unique_user_ids
from app.services.task_service import create_task
from app.services.calendar_service import sync_task_to_calendar


LOW_CONFIDENCE_THRESHOLD = 0.5
AUTO_CREATE_CONFIDENCE_THRESHOLD = 0.8

PRIORITY_ALIASES = {
    "low": TaskPriority.LOW,
    "baixa": TaskPriority.LOW,
    "medium": TaskPriority.MEDIUM,
    "media": TaskPriority.MEDIUM,
    "média": TaskPriority.MEDIUM,
    "high": TaskPriority.HIGH,
    "alta": TaskPriority.HIGH,
    "urgent": TaskPriority.HIGH,
    "urgente": TaskPriority.HIGH,
}

TYPE_ALIASES = {
    "task": TaskType.TASK,
    "tarefa": TaskType.TASK,
    "event": TaskType.EVENT,
    "evento": TaskType.EVENT,
    "reminder": TaskType.REMINDER,
    "lembrete": TaskType.REMINDER,
}


def _suggestion_id(item: TaskSuggestionImportItem, index: int) -> str:
    return item.suggestionId or f"suggestion-{index + 1}"


def _fail(item: TaskSuggestionImportItem, index: int, reason: str) -> FailedTaskImportResult:
    return FailedTaskImportResult(
        suggestionId=_suggestion_id(item, index),
        title=(item.title or "Sugestao sem titulo").strip() or "Sugestao sem titulo",
        reason=reason,
    )


def _parse_due_date(item: TaskSuggestionImportItem) -> datetime | None:
    if item.time and not item.date:
        raise ValueError("Informe uma data para usar horario.")
    if not item.date:
        return None

    try:
        parsed_date = datetime.strptime(item.date, "%Y-%m-%d").date()
    except ValueError as exc:
        raise ValueError("Data invalida. Use YYYY-MM-DD.") from exc

    parsed_time = time(hour=23, minute=59)
    if item.time:
        try:
            parsed_time = datetime.strptime(item.time, "%H:%M").time()
        except ValueError as exc:
            raise ValueError("Horario invalido. Use HH:mm.") from exc

    return datetime.combine(parsed_date, parsed_time, tzinfo=timezone.utc)


def _priority_from_suggestion(item: TaskSuggestionImportItem, warnings: list[str]) -> TaskPriority:
    value = (item.priority or "medium").strip().lower()
    priority = PRIORITY_ALIASES.get(value)
    if not priority:
        warnings.append(f"Prioridade invalida em '{item.title or 'sem titulo'}'; foi usada prioridade media.")
        return TaskPriority.MEDIUM
    if value in {"urgent", "urgente"}:
        warnings.append("CasaSync ainda nao possui prioridade urgente; o item foi criado como alta prioridade.")
    return priority


def _type_from_suggestion(item: TaskSuggestionImportItem) -> TaskType:
    value = (item.type or "task").strip().lower()
    return TYPE_ALIASES.get(value, TaskType.TASK)


def _family_members(db: Session, family_id: str) -> list[FamilyMember]:
    return db.query(FamilyMember).filter(FamilyMember.family_id == family_id).all()


def _resolve_assignee_ids(
    db: Session,
    family_id: str,
    creator_id: str,
    item: TaskSuggestionImportItem,
    warnings: list[str],
) -> list[str]:
    explicit_ids = item.assigneeIds if item.assigneeIds is not None else ([item.assigneeId] if item.assigneeId else [])
    assignee_ids = unique_user_ids(explicit_ids)
    if assignee_ids:
        return assignee_ids

    responsible = (item.responsible or "").strip().lower()
    if not responsible:
        return [creator_id]

    matches = []
    for member in _family_members(db, family_id):
        user = member.user
        if not user:
            continue
        if responsible in {user.name.strip().lower(), user.email.strip().lower()}:
            matches.append(member.user_id)

    if len(matches) == 1:
        return matches

    warnings.append(
        f"Responsavel sugerido em '{item.title or 'sem titulo'}' nao foi identificado com seguranca; a tarefa ficou para voce."
    )
    return [creator_id]


def _is_duplicate_task(db: Session, family_id: str, title: str, due_date: datetime | None) -> bool:
    candidates = (
        db.query(Task)
        .filter(
            Task.family_id == family_id,
            Task.archived_at.is_(None),
            func.lower(Task.title) == title.strip().lower(),
        )
        .limit(20)
        .all()
    )
    if not candidates:
        return False
    if due_date is None:
        return any(task.due_date is None for task in candidates)
    return any(task.due_date and task.due_date.date() == due_date.date() for task in candidates)


def _auto_review_reason(db: Session, family_id: str, item: TaskSuggestionImportItem) -> str | None:
    title = (item.title or "").strip()
    if len(title) < 2:
        return "Sugestao sem titulo suficiente para criacao automatica."

    if (item.confidence or 0.0) < AUTO_CREATE_CONFIDENCE_THRESHOLD:
        return "Confianca abaixo de 80%; precisa de revisao manual."

    if item.warnings:
        return "A IA marcou avisos ou incertezas; precisa de revisao manual."

    if item.time and not item.date:
        return "Horario sem data nao e seguro para criacao automatica."

    if item.type in {"event", "evento", "reminder", "lembrete"} and not item.date:
        return "Evento ou lembrete sem data precisa de revisao manual."

    if (item.reminderEnabled or item.reminders) and not item.date:
        return "Lembrete sugerido sem data nao pode ser criado automaticamente."

    try:
        due_date = _parse_due_date(item)
    except ValueError as exc:
        return str(exc)

    if item.category and not item.categoryId:
        return "Categoria sugerida pela IA precisa ser confirmada."

    if item.categoryId:
        category = db.query(Category).filter(Category.id == item.categoryId, Category.family_id == family_id).first()
        if not category:
            return "Categoria informada nao pertence a familia ativa."

    explicit_ids = item.assigneeIds if item.assigneeIds is not None else ([item.assigneeId] if item.assigneeId else [])
    if item.responsible and not explicit_ids:
        return "Responsavel sugerido pela IA precisa ser confirmado."

    for user_id in unique_user_ids(explicit_ids):
        try:
            require_family_member(db, family_id, user_id)
        except HTTPException:
            return "Responsavel informado nao pertence a familia ativa."

    if _is_duplicate_task(db, family_id, title, due_date):
        return "Ja existe uma tarefa muito parecida nesta familia."

    return None


def _description_with_import_note(item: TaskSuggestionImportItem) -> str | None:
    description = (item.description or "").strip()
    details = []
    if item.sourceImageName:
        details.append(f"Origem da sugestao: {item.sourceImageName}.")
    if item.originalText:
        details.append(f"Texto identificado pela IA: {item.originalText[:500]}.")
    if item.endDate or item.endTime:
        details.append(f"Fim sugerido pela IA: {' '.join(part for part in [item.endDate, item.endTime] if part)}.")
    if item.warnings:
        details.append("Avisos revisados: " + "; ".join(item.warnings[:3]))
    combined = "\n\n".join(part for part in [description, *details] if part)
    return combined[:1200] or None


def _reminders_from_suggestion(item: TaskSuggestionImportItem) -> list[dict] | None:
    if item.reminders:
        return [{"value": reminder.value, "unit": reminder.unit} for reminder in item.reminders]
    if item.reminderEnabled and item.reminderValue and item.reminderUnit:
        return [{"value": item.reminderValue, "unit": item.reminderUnit}]
    return []


def import_task_suggestions(
    db: Session,
    *,
    family_id: str,
    creator_id: str,
    items: list[TaskSuggestionImportItem],
    sync_google_calendar: bool = False,
    auto_create: bool = False,
    settings: Settings | None = None,
) -> TaskSuggestionsImportResponse:
    require_family_member(db, family_id, creator_id)

    if auto_create:
        pending_review: list[FailedTaskImportResult] = []
        safe_items: list[TaskSuggestionImportItem] = []
        for index, item in enumerate(items):
            reason = _auto_review_reason(db, family_id, item)
            if reason:
                pending_review.append(_fail(item, index, reason))
            else:
                safe_items.append(item.model_copy(update={"acceptedLowConfidence": True}))

        if not safe_items:
            return TaskSuggestionsImportResponse(
                created=[],
                failed=[],
                ignored=[],
                pendingReview=pending_review,
                warnings=["Nenhuma sugestao atingiu os criterios de criacao automatica. Revise os itens pendentes."],
            )

        result = import_task_suggestions(
            db,
            family_id=family_id,
            creator_id=creator_id,
            items=safe_items,
            sync_google_calendar=sync_google_calendar,
            auto_create=False,
            settings=settings,
        )
        result.pendingReview = pending_review
        if pending_review:
            result.warnings.append(f"{len(pending_review)} sugestao(oes) ficaram pendentes de revisao manual.")
        return result

    created: list[ImportedTaskResult] = []
    failed: list[FailedTaskImportResult] = []
    warnings: list[str] = []
    seen_batch_keys: set[str] = set()

    for index, item in enumerate(items):
        title = (item.title or "").strip()
        if len(title) < 2:
            failed.append(_fail(item, index, "Informe um titulo com pelo menos 2 caracteres."))
            continue

        confidence = item.confidence if item.confidence is not None else 0.0
        if confidence < LOW_CONFIDENCE_THRESHOLD and not item.acceptedLowConfidence:
            failed.append(_fail(item, index, "Sugestao com baixa confianca precisa de revisao confirmada."))
            continue

        try:
            due_date = _parse_due_date(item)
            batch_key = f"{title.lower()}|{due_date.date().isoformat() if due_date else ''}"
            if batch_key in seen_batch_keys:
                failed.append(_fail(item, index, "Sugestao duplicada neste lote."))
                continue
            seen_batch_keys.add(batch_key)

            if _is_duplicate_task(db, family_id, title, due_date):
                failed.append(_fail(item, index, "Ja existe uma tarefa muito parecida nesta familia."))
                continue

            assignee_ids = _resolve_assignee_ids(db, family_id, creator_id, item, warnings)
            task = create_task(
                db,
                family_id,
                creator_id,
                TaskCreate(
                    title=title,
                    description=_description_with_import_note(item),
                    assignee_ids=assignee_ids,
                    category_id=item.categoryId or None,
                    category_name=item.category or None,
                    due_date=due_date,
                    priority=_priority_from_suggestion(item, warnings),
                    status=TaskStatus.PENDING,
                    task_type=_type_from_suggestion(item),
                    automation_source="ai_image_import",
                    automation_external_id=_suggestion_id(item, index),
                    automation_source_label="Importacao por imagem",
                    automation_source_reference="Sugestao revisada e confirmada pelo usuario.",
                    reminder_enabled=item.reminderEnabled,
                    reminder_value=item.reminderValue,
                    reminder_unit=item.reminderUnit,
                    reminders=_reminders_from_suggestion(item),
                ),
            )
            calendar_event_id = None
            calendar_message = None
            if sync_google_calendar:
                if not due_date:
                    calendar_message = "Google Agenda nao foi sincronizado porque a tarefa nao tem data."
                    warnings.append(f"Google Agenda: {task.title}: {calendar_message}")
                elif not item.time:
                    calendar_message = "Google Agenda nao foi sincronizado porque falta horario confirmado."
                    warnings.append(f"Google Agenda: {task.title}: {calendar_message}")
                elif settings is None:
                    calendar_message = "Google Agenda nao foi sincronizado porque a configuracao do backend nao foi carregada."
                else:
                    sync_result = sync_task_to_calendar(
                        db,
                        family_id=family_id,
                        user_id=creator_id,
                        task_id=task.id,
                        settings=settings,
                    )
                    calendar_event_id = sync_result.event_id
                    calendar_message = sync_result.message
                    if not sync_result.synced:
                        warnings.append(f"Google Agenda: {task.title}: {sync_result.message}")

            created.append(
                ImportedTaskResult(
                    suggestionId=_suggestion_id(item, index),
                    taskId=task.id,
                    title=task.title,
                    googleCalendarEventId=calendar_event_id,
                    googleCalendarMessage=calendar_message,
                )
            )
        except (HTTPException, ValueError, ValidationError, IntegrityError) as exc:
            db.rollback()
            reason = getattr(exc, "detail", None) or str(exc)
            if isinstance(exc, IntegrityError):
                reason = "Nao foi possivel criar esta tarefa porque ela conflita com um registro existente."
            failed.append(_fail(item, index, reason))

    if created and failed:
        warnings.append("Algumas sugestoes foram criadas e outras ficaram pendentes de ajuste.")

    return TaskSuggestionsImportResponse(created=created, failed=failed, ignored=[], warnings=warnings)
