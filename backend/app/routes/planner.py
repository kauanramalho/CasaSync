from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_family_id
from app.database.session import get_db
from app.models.user import User
from app.schemas.planner import (
    PlannerCreateTasksRequest,
    PlannerCreateTasksResponse,
    PlannerRequest,
    PlannerResponse,
)
from app.services.planner_service import create_tasks_from_suggestions, generate_mock_plan
from app.services.notification_service import deliver_task_events_in_background


router = APIRouter(prefix="/planner", tags=["planner"])


@router.post("/suggest", response_model=PlannerResponse)
def suggest(payload: PlannerRequest, _current_user: User = Depends(get_current_user)):
    suggestions = generate_mock_plan(payload.prompt)
    return PlannerResponse(
        message="Plano inicial gerado pelo modo IA simulado. A estrutura já está pronta para trocar por um provedor real.",
        suggestions=suggestions,
    )


@router.post("/create-tasks", response_model=PlannerCreateTasksResponse, status_code=201)
def create_tasks(
    payload: PlannerCreateTasksRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    tasks = create_tasks_from_suggestions(db, family_id, current_user.id, payload.assignee_id, payload.suggestions)
    background_tasks.add_task(deliver_task_events_in_background, family_id)
    return PlannerCreateTasksResponse(created_tasks=tasks)
