from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_family_id
from app.database.session import get_db
from app.models.user import User
from app.schemas.task import TaskCreate, TaskRead, TaskUpdate
from app.services.task_service import complete_task, create_task, delete_task, get_task, list_tasks, update_task


router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskRead])
def list_all(
    status: str | None = Query(default=None),
    category_id: str | None = Query(default=None),
    assignee_id: str | None = Query(default=None),
    search: str | None = Query(default=None),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    return list_tasks(db, family_id, status, category_id, assignee_id, search)


@router.post("", response_model=TaskRead, status_code=201)
def create(
    payload: TaskCreate,
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    return create_task(db, family_id, current_user.id, payload)


@router.get("/{task_id}", response_model=TaskRead)
def retrieve(task_id: str, family_id: str = Depends(get_family_id), db: Session = Depends(get_db)):
    return get_task(db, family_id, task_id)


@router.patch("/{task_id}", response_model=TaskRead)
def update(task_id: str, payload: TaskUpdate, family_id: str = Depends(get_family_id), db: Session = Depends(get_db)):
    return update_task(db, family_id, task_id, payload)


@router.post("/{task_id}/complete", response_model=TaskRead)
def complete(task_id: str, family_id: str = Depends(get_family_id), db: Session = Depends(get_db)):
    return complete_task(db, family_id, task_id)


@router.delete("/{task_id}", status_code=204)
def delete(task_id: str, family_id: str = Depends(get_family_id), db: Session = Depends(get_db)):
    delete_task(db, family_id, task_id)
