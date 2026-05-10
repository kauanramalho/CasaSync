from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.models.category import Category
from app.models.enums import TaskPriority, TaskStatus
from app.models.family import FamilyMember
from app.models.task import Task, TaskAssignee
from app.models.user import User
from app.schemas.task import TaskCreate, TaskUpdate
from app.services.category_service import get_category_by_name
from app.services.family_service import require_family_member
from app.services.task_metrics import get_task_assignee_ids, split_points, unique_user_ids


PRIORITY_POINTS = {
    TaskPriority.LOW.value: 5,
    TaskPriority.MEDIUM.value: 10,
    TaskPriority.HIGH.value: 20,
}

REMINDER_DELTAS = {
    "minutes": lambda value: timedelta(minutes=value),
    "hours": lambda value: timedelta(hours=value),
    "days": lambda value: timedelta(days=value),
}


def refresh_overdue_tasks(db: Session, family_id: str) -> None:
    now = datetime.now(timezone.utc)
    overdue_tasks = (
        db.query(Task)
        .filter(
            Task.family_id == family_id,
            Task.status.in_([TaskStatus.PENDING.value, TaskStatus.IN_PROGRESS.value]),
            Task.due_date.isnot(None),
            Task.due_date < now,
        )
        .all()
    )
    for task in overdue_tasks:
        task.status = TaskStatus.OVERDUE.value
    if overdue_tasks:
        db.commit()


def _task_query(db: Session):
    return db.query(Task).options(
        selectinload(Task.assignee),
        selectinload(Task.assignee_links).selectinload(TaskAssignee.user),
        selectinload(Task.creator),
        selectinload(Task.category),
    )


def _resolve_category(db: Session, family_id: str, category_id: str | None, category_name: str | None) -> Category | None:
    if category_id:
        category = (
            db.query(Category)
            .filter(Category.id == category_id, Category.family_id == family_id)
            .first()
        )
        if not category:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Categoria nao encontrada.")
        return category

    if category_name:
        return get_category_by_name(db, family_id, category_name)

    return None


def _payload_assignee_ids(payload: TaskCreate | TaskUpdate, creator_id: str | None = None) -> list[str]:
    assignee_ids = getattr(payload, "assignee_ids", None)
    assignee_id = getattr(payload, "assignee_id", None)
    if assignee_ids is not None:
        return unique_user_ids(assignee_ids) or unique_user_ids([creator_id])
    return unique_user_ids([assignee_id or creator_id])


def _set_task_assignees(db: Session, task: Task, assignee_ids: list[str]) -> None:
    resolved_ids = unique_user_ids(assignee_ids)
    task.assignee_id = resolved_ids[0] if resolved_ids else None

    current_by_user = {link.user_id: link for link in task.assignee_links}
    for link in list(task.assignee_links):
        if link.user_id not in resolved_ids:
            db.delete(link)
            task.assignee_links.remove(link)

    for user_id in resolved_ids:
        if user_id not in current_by_user:
            task.assignee_links.append(TaskAssignee(task_id=task.id, user_id=user_id, points_awarded=0))


def _as_aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _clear_task_reminder(task: Task) -> None:
    task.reminder_enabled = False
    task.reminder_value = None
    task.reminder_unit = None
    task.reminder_at = None
    task.reminder_sent = False


def _configure_task_reminder(
    task: Task,
    *,
    enabled: bool | None,
    reminder_value: int | None,
    reminder_unit: str | None,
    due_date_changed: bool = False,
) -> None:
    if enabled is False:
        _clear_task_reminder(task)
        return

    if due_date_changed and task.due_date is None and enabled is None:
        _clear_task_reminder(task)
        return

    should_enable = enabled if enabled is not None else task.reminder_enabled
    if not should_enable:
        return

    value = reminder_value if reminder_value is not None else task.reminder_value
    unit = reminder_unit if reminder_unit is not None else task.reminder_unit

    if task.due_date is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Defina um prazo para ativar lembrete na tarefa.")
    if value is None or unit not in REMINDER_DELTAS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Escolha quando o lembrete deve acontecer.")

    reminder_at = _as_aware_utc(task.due_date) - REMINDER_DELTAS[unit](value)
    if reminder_at <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esse lembrete ja ficou no passado. Escolha um prazo maior ou uma antecedencia menor.",
        )

    task.reminder_enabled = True
    task.reminder_value = value
    task.reminder_unit = unit
    task.reminder_at = reminder_at
    task.reminder_sent = False


def _apply_member_points(db: Session, family_id: str, user_id: str, points: int) -> None:
    member = (
        db.query(FamilyMember)
        .filter(FamilyMember.family_id == family_id, FamilyMember.user_id == user_id)
        .first()
    )
    if member:
        member.points += points


def _award_task_points(db: Session, task: Task) -> None:
    total_points = PRIORITY_POINTS.get(task.priority, PRIORITY_POINTS[TaskPriority.MEDIUM.value])
    assignee_ids = get_task_assignee_ids(task)
    points_by_user = split_points(total_points, assignee_ids)

    task.points_awarded = total_points
    for link in task.assignee_links:
        link.points_awarded = points_by_user.get(link.user_id, 0)

    if task.assignee_links:
        for user_id, points in points_by_user.items():
            _apply_member_points(db, task.family_id, user_id, points)
        return

    for user_id, points in points_by_user.items():
        _apply_member_points(db, task.family_id, user_id, points)


def _revoke_task_points(db: Session, task: Task) -> None:
    if task.assignee_links:
        for link in task.assignee_links:
            if link.points_awarded:
                _apply_member_points(db, task.family_id, link.user_id, -link.points_awarded)
                link.points_awarded = 0
    elif task.points_awarded:
        for user_id, points in split_points(task.points_awarded, get_task_assignee_ids(task)).items():
            _apply_member_points(db, task.family_id, user_id, -points)

    task.points_awarded = 0
    task.completed_at = None


def _complete_task_without_commit(db: Session, task: Task, completed_at: datetime | None = None) -> None:
    if task.status == TaskStatus.DONE.value and task.points_awarded:
        return
    task.status = TaskStatus.DONE.value
    task.completed_at = completed_at or datetime.now(timezone.utc)
    _award_task_points(db, task)


def _reopen_task_without_commit(db: Session, task: Task, status_value: str = TaskStatus.PENDING.value) -> None:
    if task.status == TaskStatus.DONE.value or task.points_awarded:
        _revoke_task_points(db, task)
    task.status = status_value
    task.completed_at = None


def list_tasks(
    db: Session,
    family_id: str,
    status_filter: str | None = None,
    category_id: str | None = None,
    assignee_id: str | None = None,
    search: str | None = None,
) -> list[Task]:
    refresh_overdue_tasks(db, family_id)
    query = _task_query(db).filter(Task.family_id == family_id)

    if status_filter:
        query = query.filter(Task.status == status_filter)
    if category_id:
        query = query.filter(Task.category_id == category_id)
    if assignee_id:
        query = (
            query.outerjoin(TaskAssignee, TaskAssignee.task_id == Task.id)
            .filter(or_(Task.assignee_id == assignee_id, TaskAssignee.user_id == assignee_id))
            .distinct()
        )
    if search:
        needle = f"%{search.strip()}%"
        query = (
            query.outerjoin(Category, Category.id == Task.category_id)
            .outerjoin(TaskAssignee, TaskAssignee.task_id == Task.id)
            .outerjoin(User, or_(User.id == Task.assignee_id, User.id == TaskAssignee.user_id))
            .filter(
                or_(
                    Task.title.ilike(needle),
                    Task.description.ilike(needle),
                    Task.priority.ilike(needle),
                    Task.status.ilike(needle),
                    Category.name.ilike(needle),
                    User.name.ilike(needle),
                    User.email.ilike(needle),
                )
            )
            .distinct()
        )

    return query.order_by(Task.status.asc(), Task.due_date.asc(), Task.created_at.desc()).all()


def get_task(db: Session, family_id: str, task_id: str) -> Task:
    task = _task_query(db).filter(Task.id == task_id, Task.family_id == family_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tarefa nao encontrada.")
    return task


def create_task(db: Session, family_id: str, creator_id: str, payload: TaskCreate) -> Task:
    require_family_member(db, family_id, creator_id)
    assignee_ids = _payload_assignee_ids(payload, creator_id)
    for user_id in assignee_ids:
        require_family_member(db, family_id, user_id)

    category = _resolve_category(db, family_id, payload.category_id, payload.category_name)

    task = Task(
        family_id=family_id,
        title=payload.title.strip(),
        description=payload.description,
        assignee_id=assignee_ids[0] if assignee_ids else creator_id,
        creator_id=creator_id,
        category_id=category.id if category else None,
        due_date=payload.due_date,
        priority=payload.priority.value,
        status=TaskStatus.PENDING.value,
    )
    _configure_task_reminder(
        task,
        enabled=payload.reminder_enabled,
        reminder_value=payload.reminder_value,
        reminder_unit=payload.reminder_unit,
    )
    db.add(task)
    db.flush()
    _set_task_assignees(db, task, assignee_ids)

    if payload.status == TaskStatus.DONE:
        _complete_task_without_commit(db, task)
    else:
        task.status = payload.status.value

    db.commit()
    return get_task(db, family_id, task.id)


def update_task(db: Session, family_id: str, task_id: str, payload: TaskUpdate) -> Task:
    task = get_task(db, family_id, task_id)
    data = payload.model_dump(exclude_unset=True)
    was_done = task.status == TaskStatus.DONE.value
    previous_completed_at = task.completed_at
    due_date_changed = "due_date" in data

    if "assignee_ids" in data:
        assignee_ids = _payload_assignee_ids(payload, task.creator_id)
    elif "assignee_id" in data:
        assignee_ids = _payload_assignee_ids(payload, task.creator_id)
    else:
        assignee_ids = None

    if assignee_ids is not None:
        for user_id in assignee_ids:
            require_family_member(db, family_id, user_id)
    if "category_id" in data and data["category_id"]:
        _resolve_category(db, family_id, data["category_id"], None)

    if was_done:
        _revoke_task_points(db, task)

    status_value = data.pop("status", None)
    priority_value = data.pop("priority", None)
    reminder_enabled = data.pop("reminder_enabled", None)
    reminder_value = data.pop("reminder_value", None)
    reminder_unit = data.pop("reminder_unit", None)
    reminder_sent = data.pop("reminder_sent", None)
    data.pop("assignee_ids", None)
    data.pop("assignee_id", None)

    for field, value in data.items():
        setattr(task, field, value)

    next_status_done = status_value in (TaskStatus.DONE, TaskStatus.DONE.value)
    if next_status_done:
        if reminder_enabled is False:
            _clear_task_reminder(task)
        elif task.reminder_enabled or reminder_enabled:
            task.reminder_sent = True
    else:
        _configure_task_reminder(
            task,
            enabled=reminder_enabled,
            reminder_value=reminder_value,
            reminder_unit=reminder_unit,
            due_date_changed=due_date_changed,
        )
        if reminder_sent is not None and reminder_enabled is None and reminder_value is None and reminder_unit is None:
            task.reminder_sent = reminder_sent

    if assignee_ids is not None:
        _set_task_assignees(db, task, assignee_ids)
    if priority_value:
        task.priority = priority_value.value

    if status_value == TaskStatus.DONE or (status_value is None and was_done):
        _complete_task_without_commit(db, task, previous_completed_at if was_done else None)
    elif status_value:
        _reopen_task_without_commit(db, task, status_value.value)
    elif was_done:
        _complete_task_without_commit(db, task, previous_completed_at)

    db.commit()
    return get_task(db, family_id, task.id)


def complete_task(db: Session, family_id: str, task_id: str) -> Task:
    task = get_task(db, family_id, task_id)
    if task.status == TaskStatus.DONE.value:
        _reopen_task_without_commit(db, task)
    else:
        _complete_task_without_commit(db, task)
        task.reminder_sent = True

    db.commit()
    return get_task(db, family_id, task.id)


def delete_task(db: Session, family_id: str, task_id: str) -> None:
    task = get_task(db, family_id, task_id)
    if task.status == TaskStatus.DONE.value or task.points_awarded:
        _revoke_task_points(db, task)
    db.delete(task)
    db.commit()
