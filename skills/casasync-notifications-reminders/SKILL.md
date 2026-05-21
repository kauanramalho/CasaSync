---
name: casasync-notifications-reminders
description: "Use this skill whenever a CasaSync task involves reminders, internal notifications, email notifications, browser push, service workers, PWA behavior, notification bars, tasks near due date, background execution, or notification delivery state. Keep reminder logic backend-aware and duplicate-safe."
---

# CasaSync Notifications Reminders

## Purpose

Keep CasaSync reminders and notifications reliable, private, and duplicate-safe across internal UI, email, push, and background checks.

## Required Map

Before editing notification behavior, inspect:

- Task reminder fields in `backend/app/models/task.py` and `backend/app/schemas/task.py`.
- Reminder calculation and task lifecycle in `backend/app/services/task_service.py`.
- Notification-related hooks and UI under `frontend/src/hooks` and `frontend/src/components`.
- Existing reminder endpoints under `backend/app/routes/tasks.py`.
- Email settings in `backend/app/core/config.py` and any email/2FA service patterns.
- Current frontend polling, local notification storage, toast, and app event behavior.

## Rules

- Separate internal notifications, email, and browser push as distinct delivery channels.
- Do not rely only on frontend timers for important reminders.
- Put reusable reminder calculations in backend services.
- Avoid duplicate notifications by checking persisted state or deterministic dedupe keys.
- Record send/delivery state when a notification should happen only once.
- Do not send email unless SMTP/configuration and product confirmation allow it.
- Do not expose SMTP credentials, web push keys, tokens, email contents, or personal task data in logs.
- Put email and push behavior behind feature flags or explicit config.
- Provide safe fallback when email or push is disabled.
- Keep completed, archived, deleted, or already-notified tasks from triggering stale notifications.

## Implementation Guidance

- Prefer backend endpoints/services that return due reminder candidates scoped by active family.
- Keep UI feedback aligned with the existing toast/banner/notification style.
- Use clear channel-specific naming, for example internal reminder, email reminder, push reminder.
- Keep messages useful but privacy-conscious; avoid over-sharing task contents outside the app.
- Preserve existing task completion, reminder hydration, and dashboard/calendar flows.

## Verification

Before finishing a notification change, test:

- Task approaching its reminder time.
- Task already overdue.
- Task completed before notification.
- Task without reminder.
- Task already notified.
- Email/push disabled fallback.
- Duplicate prevention across refresh or repeated polling.
