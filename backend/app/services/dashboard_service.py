from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.enums import TaskStatus
from app.models.task import Task
from app.schemas.dashboard import CategoryStat, DashboardRead, DashboardStat, ProductivityPoint, RankingItem
from app.services.family_service import list_members
from app.services.task_service import list_tasks, refresh_overdue_tasks


def get_dashboard(db: Session, family_id: str) -> DashboardRead:
    refresh_overdue_tasks(db, family_id)
    tasks = list_tasks(db, family_id)
    members = list_members(db, family_id)

    completed = [task for task in tasks if task.status == TaskStatus.DONE.value]
    pending = [task for task in tasks if task.status in [TaskStatus.PENDING.value, TaskStatus.IN_PROGRESS.value]]
    overdue = [task for task in tasks if task.status == TaskStatus.OVERDUE.value]

    category_map: dict[str, CategoryStat] = {}
    for task in tasks:
        if not task.category:
            continue
        stat = category_map.setdefault(
            task.category.name,
            CategoryStat(category=task.category.name, total=0, color=task.category.color),
        )
        stat.total += 1

    completed_by_user: dict[str, int] = {}
    for task in completed:
        if task.assignee_id:
            completed_by_user[task.assignee_id] = completed_by_user.get(task.assignee_id, 0) + 1

    ranking = [
        RankingItem(
            user=member.user,
            points=member.points,
            completed_tasks=completed_by_user.get(member.user_id, 0),
            position=index + 1,
        )
        for index, member in enumerate(members)
    ]

    today = datetime.now(timezone.utc).date()
    weekly_points = []
    for offset in range(6, -1, -1):
        day = today - timedelta(days=offset)
        total = sum(1 for task in completed if task.completed_at and task.completed_at.date() == day)
        weekly_points.append(ProductivityPoint(label=day.strftime("%d/%m"), total=total))

    recent_tasks = (
        db.query(Task)
        .filter(Task.family_id == family_id)
        .order_by(Task.created_at.desc())
        .limit(6)
        .all()
    )

    return DashboardRead(
        stats=[
            DashboardStat(key="done", label="Concluídas", value=len(completed), hint="+ pontos para o casal"),
            DashboardStat(key="pending", label="Pendentes", value=len(pending), hint="tarefas em aberto"),
            DashboardStat(key="overdue", label="Atrasadas", value=len(overdue), hint="precisam de carinho hoje"),
            DashboardStat(key="points", label="Pontos do casal", value=sum(member.points for member in members), hint="gamificação ativa"),
        ],
        tasks_by_category=sorted(category_map.values(), key=lambda item: item.total, reverse=True),
        ranking=ranking,
        weekly_productivity=weekly_points,
        recent_tasks=recent_tasks,
    )

