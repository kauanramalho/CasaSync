from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import TaskPriority, TaskStatus
from app.schemas.category import CategoryRead
from app.schemas.common import ORMModel
from app.schemas.user import UserSummary


class TaskCreate(BaseModel):
    title: str = Field(min_length=2, max_length=180)
    description: str | None = None
    assignee_id: str | None = None
    assignee_ids: list[str] | None = None
    category_id: str | None = None
    category_name: str | None = None
    due_date: datetime | None = None
    priority: TaskPriority = TaskPriority.MEDIUM
    status: TaskStatus = TaskStatus.PENDING


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=180)
    description: str | None = None
    assignee_id: str | None = None
    assignee_ids: list[str] | None = None
    category_id: str | None = None
    due_date: datetime | None = None
    priority: TaskPriority | None = None
    status: TaskStatus | None = None


class TaskAssigneeAwardRead(BaseModel):
    user_id: str
    user: UserSummary
    points: int


class TaskRead(ORMModel):
    id: str
    family_id: str
    title: str
    description: str | None = None
    assignee_id: str | None = None
    creator_id: str | None = None
    category_id: str | None = None
    due_date: datetime | None = None
    priority: TaskPriority
    status: TaskStatus
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None
    points_awarded: int
    assignee: UserSummary | None = None
    assignee_ids: list[str] = []
    assignees: list[UserSummary] = []
    assignee_points: list[TaskAssigneeAwardRead] = []
    creator: UserSummary | None = None
    category: CategoryRead | None = None
