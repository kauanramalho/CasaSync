from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_family_id
from app.database.session import get_db
from app.models.user import User
from app.schemas.automation import (
    AutomationTaskInput,
    AutomationTaskOperationResponse,
    AutomationTaskRescheduleInput,
    AutomationTasksResponse,
    AutomationTaskUpdateInput,
)
from app.services.automation_service import (
    cancel_automation_task,
    create_automation_tasks,
    reschedule_automation_task,
    update_automation_task,
)


router = APIRouter(prefix="/automation", tags=["automation"])


@router.post("/tasks", response_model=AutomationTasksResponse, status_code=201)
def create_tasks(
    payload: list[AutomationTaskInput],
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    return create_automation_tasks(db, family_id, current_user.id, payload)


@router.post("/appointments", response_model=AutomationTasksResponse, status_code=201)
def create_appointments(
    payload: list[AutomationTaskInput],
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    return create_automation_tasks(db, family_id, current_user.id, payload)


@router.patch("/tasks/{task_id}", response_model=AutomationTaskOperationResponse)
def update_task_from_automation(
    task_id: str,
    payload: AutomationTaskUpdateInput,
    _current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    return update_automation_task(db, family_id, task_id, payload)


@router.post("/tasks/{task_id}/reschedule", response_model=AutomationTaskOperationResponse)
def reschedule_task_from_automation(
    task_id: str,
    payload: AutomationTaskRescheduleInput,
    _current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    return reschedule_automation_task(db, family_id, task_id, payload)


@router.post("/tasks/{task_id}/cancel", response_model=AutomationTaskOperationResponse)
def cancel_task_from_automation(
    task_id: str,
    _current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    return cancel_automation_task(db, family_id, task_id)
