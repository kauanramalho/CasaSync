from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import TaskPriority
from app.schemas.task import TaskRead


class PlannerRequest(BaseModel):
    prompt: str = Field(min_length=4, max_length=1200)


class PlannerSuggestion(BaseModel):
    title: str
    description: str
    category_name: str
    priority: TaskPriority
    due_date: datetime | None = None


class PlannerResponse(BaseModel):
    message: str
    suggestions: list[PlannerSuggestion]


class PlannerCreateTasksRequest(BaseModel):
    suggestions: list[PlannerSuggestion]
    assignee_id: str | None = None


class PlannerCreateTasksResponse(BaseModel):
    created_tasks: list[TaskRead]

