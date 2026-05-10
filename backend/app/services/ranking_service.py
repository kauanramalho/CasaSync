from datetime import datetime, timezone

from sqlalchemy.orm import Session, selectinload

from app.models.enums import TaskStatus
from app.models.family import FamilyMember
from app.models.ranking import MonthlyScore, MonthlyWinner
from app.models.task import Task, TaskAssignee
from app.services.task_metrics import get_task_points_by_user


def current_period(now: datetime | None = None) -> tuple[int, int]:
    reference = now or datetime.now(timezone.utc)
    if reference.tzinfo is None:
        reference = reference.replace(tzinfo=timezone.utc)
    return reference.year, reference.month


def previous_period(now: datetime | None = None) -> tuple[int, int]:
    year, month = current_period(now)
    if month == 1:
        return year - 1, 12
    return year, month - 1


def _period_from_datetime(value: datetime) -> tuple[int, int]:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    value = value.astimezone(timezone.utc)
    return value.year, value.month


def _period_is_before(period: tuple[int, int], reference: tuple[int, int]) -> bool:
    return period[0] < reference[0] or (period[0] == reference[0] and period[1] < reference[1])


def _get_or_create_score(db: Session, family_id: str, user_id: str, year: int, month: int) -> MonthlyScore:
    score = (
        db.query(MonthlyScore)
        .filter(
            MonthlyScore.family_id == family_id,
            MonthlyScore.user_id == user_id,
            MonthlyScore.period_year == year,
            MonthlyScore.period_month == month,
        )
        .first()
    )
    if score:
        return score

    score = MonthlyScore(
        family_id=family_id,
        user_id=user_id,
        period_year=year,
        period_month=month,
        points=0,
        completed_tasks=0,
    )
    db.add(score)
    db.flush()
    return score


def record_task_score(db: Session, task: Task, recorded_at: datetime | None = None) -> None:
    if task.status != TaskStatus.DONE.value or not task.completed_at or task.score_recorded_at:
        return

    points_by_user = get_task_points_by_user(task)
    if not points_by_user:
        return

    year, month = _period_from_datetime(task.completed_at)
    closed_winner = (
        db.query(MonthlyWinner)
        .filter(
            MonthlyWinner.family_id == task.family_id,
            MonthlyWinner.period_year == year,
            MonthlyWinner.period_month == month,
        )
        .first()
    )
    if closed_winner:
        task.score_recorded_at = recorded_at or datetime.now(timezone.utc)
        return

    for user_id, points in points_by_user.items():
        if points <= 0:
            continue
        score = _get_or_create_score(db, task.family_id, user_id, year, month)
        score.points += points
        score.completed_tasks += 1

    task.score_recorded_at = recorded_at or datetime.now(timezone.utc)


def revoke_task_score(db: Session, task: Task) -> None:
    if not task.completed_at or not task.score_recorded_at:
        task.score_recorded_at = None
        return

    year, month = _period_from_datetime(task.completed_at)
    closed_winner = (
        db.query(MonthlyWinner)
        .filter(
            MonthlyWinner.family_id == task.family_id,
            MonthlyWinner.period_year == year,
            MonthlyWinner.period_month == month,
        )
        .first()
    )
    if closed_winner:
        task.score_recorded_at = None
        return

    for user_id, points in get_task_points_by_user(task).items():
        if points <= 0:
            continue
        score = (
            db.query(MonthlyScore)
            .filter(
                MonthlyScore.family_id == task.family_id,
                MonthlyScore.user_id == user_id,
                MonthlyScore.period_year == year,
                MonthlyScore.period_month == month,
            )
            .first()
        )
        if not score:
            continue
        score.points = max(0, score.points - points)
        score.completed_tasks = max(0, score.completed_tasks - 1)

    task.score_recorded_at = None


def sync_unrecorded_completed_tasks(db: Session, family_id: str) -> None:
    tasks = (
        db.query(Task)
        .options(selectinload(Task.assignee_links).selectinload(TaskAssignee.user))
        .filter(
            Task.family_id == family_id,
            Task.status == TaskStatus.DONE.value,
            Task.completed_at.isnot(None),
            Task.points_awarded > 0,
            Task.score_recorded_at.is_(None),
        )
        .all()
    )
    for task in tasks:
        record_task_score(db, task)


def close_elapsed_months(db: Session, family_id: str, now: datetime | None = None) -> None:
    reference = current_period(now)
    periods = (
        db.query(MonthlyScore.period_year, MonthlyScore.period_month)
        .filter(MonthlyScore.family_id == family_id)
        .distinct()
        .all()
    )

    for year, month in periods:
        if not _period_is_before((year, month), reference):
            continue
        existing = (
            db.query(MonthlyWinner)
            .filter(
                MonthlyWinner.family_id == family_id,
                MonthlyWinner.period_year == year,
                MonthlyWinner.period_month == month,
            )
            .first()
        )
        if existing:
            continue

        winner_score = (
            db.query(MonthlyScore)
            .options(selectinload(MonthlyScore.user))
            .filter(
                MonthlyScore.family_id == family_id,
                MonthlyScore.period_year == year,
                MonthlyScore.period_month == month,
                MonthlyScore.points > 0,
            )
            .order_by(MonthlyScore.points.desc(), MonthlyScore.completed_tasks.desc(), MonthlyScore.updated_at.asc())
            .first()
        )
        if not winner_score:
            continue

        db.add(
            MonthlyWinner(
                family_id=family_id,
                winner_user_id=winner_score.user_id,
                winner_name=winner_score.user.name if winner_score.user else None,
                period_year=year,
                period_month=month,
                points=winner_score.points,
                completed_tasks=winner_score.completed_tasks,
                closed_at=datetime.now(timezone.utc),
            )
        )


def get_previous_month_winner(db: Session, family_id: str, now: datetime | None = None) -> MonthlyWinner | None:
    year, month = previous_period(now)
    return (
        db.query(MonthlyWinner)
        .filter(
            MonthlyWinner.family_id == family_id,
            MonthlyWinner.period_year == year,
            MonthlyWinner.period_month == month,
        )
        .first()
    )


def get_current_scores_by_user(db: Session, family_id: str, now: datetime | None = None) -> dict[str, MonthlyScore]:
    year, month = current_period(now)
    scores = (
        db.query(MonthlyScore)
        .filter(
            MonthlyScore.family_id == family_id,
            MonthlyScore.period_year == year,
            MonthlyScore.period_month == month,
        )
        .all()
    )
    return {score.user_id: score for score in scores}


def sort_members_by_monthly_score(members: list[FamilyMember], scores_by_user: dict[str, MonthlyScore]) -> list[FamilyMember]:
    return sorted(
        members,
        key=lambda member: (
            -(scores_by_user.get(member.user_id).points if scores_by_user.get(member.user_id) else 0),
            -(scores_by_user.get(member.user_id).completed_tasks if scores_by_user.get(member.user_id) else 0),
            member.created_at,
        ),
    )
