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
    MonthlyWinnerRead,
    RankingItem,
)
from app.services.family_service import list_members
from app.services.ranking_service import get_current_scores_by_user, get_previous_month_winner, sort_members_by_monthly_score
from app.services.task_metrics import get_task_assignee_ids, get_task_points_by_user, is_task_completed_on
from app.services.task_service import list_tasks, refresh_overdue_tasks


def _recent_task_query(db: Session):
    return db.query(Task).options(
        selectinload(Task.assignee),
        selectinload(Task.assignee_links).selectinload(TaskAssignee.user),
        selectinload(Task.creator),
        selectinload(Task.category),
        selectinload(Task.attachments),
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
        if len(stat.tasks) < 12:
            stat.tasks.append(task)

    monthly_scores = get_current_scores_by_user(db, family_id)
    ranked_members = sort_members_by_monthly_score(members, monthly_scores)
    ranking = [
        RankingItem(
            user=member.user,
            points=monthly_scores.get(member.user_id).points if monthly_scores.get(member.user_id) else 0,
            completed_tasks=monthly_scores.get(member.user_id).completed_tasks if monthly_scores.get(member.user_id) else 0,
            position=index + 1,
        )
        for index, member in enumerate(ranked_members)
    ]

    today = datetime.now(timezone.utc).date()
    weekly_points = []
    for offset in range(6, -1, -1):
        day = today - timedelta(days=offset)
        day_tasks = [task for task in completed if is_task_completed_on(task, day)]
        due_tasks = [task for task in tasks if task.due_date and task.due_date.date() == day]
        pending_tasks = [task for task in due_tasks if task.status in [TaskStatus.PENDING.value, TaskStatus.IN_PROGRESS.value]]
        overdue_tasks = [task for task in due_tasks if task.status == TaskStatus.OVERDUE.value]
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
                total=len(day_tasks) + len(pending_tasks) + len(overdue_tasks),
                done=len(day_tasks),
                pending=len(pending_tasks),
                overdue=len(overdue_tasks),
                tasks=day_tasks,
                pending_tasks=pending_tasks,
                overdue_tasks=overdue_tasks,
                members=member_points,
            )
        )

    recent_tasks = (
        _recent_task_query(db)
        .filter(Task.family_id == family_id)
        .filter(Task.archived_at.is_(None))
        .filter(Task.status != TaskStatus.DONE.value)
        .order_by(Task.created_at.desc())
        .limit(8)
        .all()
    )
    previous_winner = get_previous_month_winner(db, family_id)

    return DashboardRead(
        stats=[
            DashboardStat(key="done", label="Concluidas", value=len(completed), hint="+ pontos para o casal"),
            DashboardStat(key="pending", label="Pendentes", value=len(pending), hint="tarefas em aberto"),
            DashboardStat(key="overdue", label="Atrasadas", value=len(overdue), hint="precisam de carinho hoje"),
            DashboardStat(key="points", label="Pontos do mes", value=sum(item.points for item in monthly_scores.values()), hint="ranking mensal"),
        ],
        tasks_by_category=sorted(category_map.values(), key=lambda item: item.total, reverse=True),
        ranking=ranking,
        previous_month_winner=(
            MonthlyWinnerRead(
                period_year=previous_winner.period_year,
                period_month=previous_winner.period_month,
                winner_user_id=previous_winner.winner_user_id,
                winner_name=previous_winner.winner_name,
                points=previous_winner.points,
                completed_tasks=previous_winner.completed_tasks,
                closed_at=previous_winner.closed_at,
            )
            if previous_winner
            else None
        ),
        weekly_productivity=weekly_points,
        recent_tasks=recent_tasks,
    )
