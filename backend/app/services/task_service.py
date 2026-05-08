from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.models.category import Category
from app.models.enums import TaskPriority, TaskStatus
from app.models.family import FamilyMember
from app.models.task import Task
from app.schemas.task import TaskCreate, TaskUpdate
from app.services.category_service import get_category_by_name
from app.services.family_service import require_family_member


PRIORITY_POINTS = {
    TaskPriority.LOW.value: 5,
    TaskPriority.MEDIUM.value: 10,
    TaskPriority.HIGH.value: 20,
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
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Categoria não encontrada.")
        return category

    if category_name:
        return get_category_by_name(db, family_id, category_name)

    return None


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
        query = query.filter(Task.assignee_id == assignee_id)
    if search:
        query = query.filter(Task.title.ilike(f"%{search.strip()}%"))

    return query.order_by(Task.status.asc(), Task.due_date.asc(), Task.created_at.desc()).all()


def get_task(db: Session, family_id: str, task_id: str) -> Task:
    task = _task_query(db).filter(Task.id == task_id, Task.family_id == family_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tarefa não encontrada.")
    return task


def create_task(db: Session, family_id: str, creator_id: str, payload: TaskCreate) -> Task:
    require_family_member(db, family_id, creator_id)

    if payload.assignee_id:
        require_family_member(db, family_id, payload.assignee_id)

    category = _resolve_category(db, family_id, payload.category_id, payload.category_name)

    task = Task(
        family_id=family_id,
        title=payload.title.strip(),
        description=payload.description,
        assignee_id=payload.assignee_id or creator_id,
        creator_id=creator_id,
        category_id=category.id if category else None,
        due_date=payload.due_date,
        priority=payload.priority.value,
        status=payload.status.value,
    )
    db.add(task)
    db.commit()
    return get_task(db, family_id, task.id)


def update_task(db: Session, family_id: str, task_id: str, payload: TaskUpdate) -> Task:
    task = get_task(db, family_id, task_id)
    data = payload.model_dump(exclude_unset=True)

    if "assignee_id" in data and data["assignee_id"]:
        require_family_member(db, family_id, data["assignee_id"])
    if "category_id" in data and data["category_id"]:
        _resolve_category(db, family_id, data["category_id"], None)

    status_value = data.pop("status", None)
    priority_value = data.pop("priority", None)

    for field, value in data.items():
        setattr(task, field, value)

    if priority_value:
        task.priority = priority_value.value
    if status_value:
        if status_value == TaskStatus.DONE:
            return complete_task(db, family_id, task_id)
        task.status = status_value.value
        task.completed_at = None

    db.commit()
    return get_task(db, family_id, task.id)


def complete_task(db: Session, family_id: str, task_id: str) -> Task:
    task = get_task(db, family_id, task_id)
    if task.status == TaskStatus.DONE.value:
        return task

    task.status = TaskStatus.DONE.value
    task.completed_at = datetime.now(timezone.utc)
    task.points_awarded = PRIORITY_POINTS.get(task.priority, 10)

    member_user_id = task.assignee_id or task.creator_id
    if member_user_id:
        member = (
            db.query(FamilyMember)
            .filter(FamilyMember.family_id == family_id, FamilyMember.user_id == member_user_id)
            .first()
        )
        if member:
            member.points += task.points_awarded

    db.commit()
    return get_task(db, family_id, task.id)
