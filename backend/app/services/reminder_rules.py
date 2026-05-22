from datetime import datetime, timedelta, timezone
from typing import Any


ALLOWED_REMINDER_MINUTES = (15, 30, 60, 180, 720, 1440, 4320)
MAX_TASK_REMINDERS = 5

CANONICAL_REMINDERS_BY_MINUTES = {
    15: (15, "minutes"),
    30: (30, "minutes"),
    60: (1, "hours"),
    180: (3, "hours"),
    720: (12, "hours"),
    1440: (1, "days"),
    4320: (3, "days"),
}

REMINDER_DELTAS = {
    "minutes": lambda value: timedelta(minutes=value),
    "hours": lambda value: timedelta(hours=value),
    "days": lambda value: timedelta(days=value),
}


def as_aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def reminder_to_minutes(value: int, unit: str) -> int | None:
    multipliers = {"minutes": 1, "hours": 60, "days": 24 * 60}
    multiplier = multipliers.get(unit)
    if not multiplier:
        return None
    try:
        parsed_value = int(value)
    except (TypeError, ValueError):
        return None
    if parsed_value <= 0:
        return None
    total_minutes = parsed_value * multiplier
    return total_minutes if total_minutes in ALLOWED_REMINDER_MINUTES else None


def canonical_reminder_from_minutes(minutes: int) -> tuple[int, str] | None:
    return CANONICAL_REMINDERS_BY_MINUTES.get(int(minutes))


def _raw_reminder_value(reminder: Any, *names: str):
    if isinstance(reminder, dict):
        for name in names:
            if name in reminder:
                return reminder.get(name)
        return None
    for name in names:
        if hasattr(reminder, name):
            return getattr(reminder, name)
    return None


def normalize_reminder_entries(
    reminders: list[Any] | None,
    *,
    due_date: datetime | None = None,
    now: datetime | None = None,
    discard_past: bool = False,
) -> tuple[list[tuple[int, str]], int, int]:
    normalized: list[tuple[int, str]] = []
    seen_minutes: set[int] = set()
    invalid_count = 0
    past_count = 0
    reference_now = now or datetime.now(timezone.utc)

    for reminder in reminders or []:
        minutes = _raw_reminder_value(reminder, "minutes", "offsetMinutes", "offset_minutes")
        if minutes is None:
            value = _raw_reminder_value(reminder, "value", "reminder_value", "reminderValue", "amount")
            unit = _raw_reminder_value(reminder, "unit", "reminder_unit", "reminderUnit")
            minutes = reminder_to_minutes(value, str(unit).strip().lower() if unit is not None else "")
        else:
            try:
                minutes = int(minutes)
            except (TypeError, ValueError):
                minutes = None

        canonical = canonical_reminder_from_minutes(minutes) if minutes is not None else None
        if not canonical:
            invalid_count += 1
            continue
        if minutes in seen_minutes:
            continue
        if discard_past and due_date is not None:
            value, unit = canonical
            reminder_at = as_aware_utc(due_date) - REMINDER_DELTAS[unit](value)
            if reminder_at <= reference_now:
                past_count += 1
                continue

        seen_minutes.add(minutes)
        normalized.append(canonical)
        if len(normalized) >= MAX_TASK_REMINDERS:
            break

    return normalized, invalid_count, past_count


def format_reminder_label_from_minutes(minutes: int) -> str:
    labels = {
        15: "15 minutos antes",
        30: "30 minutos antes",
        60: "1 hora antes",
        180: "3 horas antes",
        720: "12 horas antes",
        1440: "1 dia antes",
        4320: "3 dias antes",
    }
    return labels.get(int(minutes), "")
