from datetime import date

from app.models.task import Task


def unique_user_ids(user_ids: list[str | None]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for user_id in user_ids:
        if user_id and user_id not in seen:
            seen.add(user_id)
            result.append(user_id)
    return result


def get_task_assignee_ids(task: Task) -> list[str]:
    linked_ids = unique_user_ids([link.user_id for link in task.assignee_links])
    if linked_ids:
        return linked_ids
    return unique_user_ids([task.assignee_id or task.creator_id])


def split_points(total_points: int, user_ids: list[str]) -> dict[str, int]:
    assignee_ids = unique_user_ids(user_ids)
    if not assignee_ids:
        return {}

    base_points = total_points // len(assignee_ids)
    remainder = total_points % len(assignee_ids)
    return {
        user_id: base_points + (1 if index < remainder else 0)
        for index, user_id in enumerate(assignee_ids)
    }


def get_task_points_by_user(task: Task) -> dict[str, int]:
    linked_points = {
        link.user_id: link.points_awarded
        for link in task.assignee_links
        if link.user_id and link.points_awarded
    }
    if linked_points:
        return linked_points

    assignee_ids = get_task_assignee_ids(task)
    if task.points_awarded and assignee_ids:
        return split_points(task.points_awarded, assignee_ids)
    return {user_id: 0 for user_id in assignee_ids}


def is_task_completed_on(task: Task, day: date) -> bool:
    return bool(task.completed_at and task.completed_at.date() == day)
