from pydantic import BaseModel

from app.schemas.task import TaskRead
from app.schemas.user import UserSummary


class DashboardStat(BaseModel):
    key: str
    label: str
    value: int
    hint: str | None = None


class CategoryStat(BaseModel):
    category: str
    total: int
    color: str


class RankingItem(BaseModel):
    user: UserSummary
    points: int
    completed_tasks: int
    position: int


class ProductivityPoint(BaseModel):
    label: str
    total: int


class DashboardRead(BaseModel):
    stats: list[DashboardStat]
    tasks_by_category: list[CategoryStat]
    ranking: list[RankingItem]
    weekly_productivity: list[ProductivityPoint]
    recent_tasks: list[TaskRead]

