from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.enums import TaskStatus
from app.models.task import Task
from app.services.ranking_service import close_elapsed_months, sync_unrecorded_completed_tasks


ARCHIVE_COMPLETED_AFTER_DAYS = 7
DELETE_COMPLETED_AFTER_DAYS = 30


def maintain_task_retention(db: Session, family_id: str) -> None:
    now = datetime.now(timezone.utc)

    completed_without_date = (
        db.query(Task)
        .filter(
            Task.family_id == family_id,
            Task.status == TaskStatus.DONE.value,
            Task.completed_at.is_(None),
        )
        .all()
    )
    for task in completed_without_date:
        task.completed_at = now

    sync_unrecorded_completed_tasks(db, family_id)
    close_elapsed_months(db, family_id, now)

    archive_cutoff = now - timedelta(days=ARCHIVE_COMPLETED_AFTER_DAYS)
    tasks_to_archive = (
        db.query(Task)
        .filter(
            Task.family_id == family_id,
            Task.status == TaskStatus.DONE.value,
            Task.completed_at.isnot(None),
            Task.completed_at <= archive_cutoff,
            Task.archived_at.is_(None),
        )
        .all()
    )
    for task in tasks_to_archive:
        task.archived_at = now

    delete_cutoff = now - timedelta(days=DELETE_COMPLETED_AFTER_DAYS)
    tasks_to_delete = (
        db.query(Task)
        .filter(
            Task.family_id == family_id,
            Task.status == TaskStatus.DONE.value,
            Task.completed_at.isnot(None),
            Task.completed_at <= delete_cutoff,
        )
        .all()
    )
    for task in tasks_to_delete:
        db.delete(task)

    db.commit()
