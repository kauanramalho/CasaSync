from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session, selectinload

from app.models.enums import TaskStatus
from app.models.task import Task, TaskAssignee
from app.schemas.dashboard import (
    CategoryStat,
    DailyProductivityPoint,
    DashboardRead,
    DashboardStat,
    MemberProductivityPoint,
    RankingItem,
)
from app.services.family_service import list_members
from app.services.task_metrics import get_task_assignee_ids, get_task_points_by_user, is_task_completed_on
from app.services.task_service import list_tasks, refresh_overdue_tasks


def _recent_task_query(db: Session):
    return db.query(Task).options(
        selectinload(Task.assignee),
        selectinload(Task.assignee_links).selectinload(TaskAssignee.user),
        selectinload(Task.creator),
        selectinload(Task.category),
    )


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
            CategoryStat(category=task.category.name, total=0, color=task.category.color, tasks=[]),
        )
        stat.total += 1
        stat.tasks.append(task)

    completed_by_user: dict[str, int] = {}
    for task in completed:
        for user_id in get_task_assignee_ids(task):
            completed_by_user[user_id] = completed_by_user.get(user_id, 0) + 1

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
        day_tasks = [task for task in completed if is_task_completed_on(task, day)]
        member_points = []
        for member in members:
            member_tasks = [
                task
                for task in day_tasks
                if member.user_id in get_task_assignee_ids(task)
            ]
            member_points.append(
                MemberProductivityPoint(
                    user=member.user,
                    total=len(member_tasks),
                    points=sum(get_task_points_by_user(task).get(member.user_id, 0) for task in member_tasks),
                    tasks=member_tasks,
                )
            )
        weekly_points.append(
            DailyProductivityPoint(
                label=day.strftime("%d/%m"),
                date=day.isoformat(),
                total=len(day_tasks),
                tasks=day_tasks,
                members=member_points,
            )
        )

    recent_tasks = (
        _recent_task_query(db)
        .filter(Task.family_id == family_id)
        .order_by(Task.created_at.desc())
        .limit(8)
        .all()
    )

    return DashboardRead(
        stats=[
            DashboardStat(key="done", label="Concluidas", value=len(completed), hint="+ pontos para o casal"),
            DashboardStat(key="pending", label="Pendentes", value=len(pending), hint="tarefas em aberto"),
            DashboardStat(key="overdue", label="Atrasadas", value=len(overdue), hint="precisam de carinho hoje"),
            DashboardStat(key="points", label="Pontos do casal", value=sum(member.points for member in members), hint="gamificacao ativa"),
        ],
        tasks_by_category=sorted(category_map.values(), key=lambda item: item.total, reverse=True),
        ranking=ranking,
        weekly_productivity=weekly_points,
        recent_tasks=recent_tasks,
    )
