---
name: casasync-task-creation-service
description: "Use this skill whenever a CasaSync task involves creating, importing, bulk-creating, confirming, duplicating, or saving tasks, including tasks suggested by AI, image extraction, planner flows, calendar imports, or UI forms. Reuse existing services, schemas, validation, authentication, active family, assignee, category, permission, ranking, reminder, and database behavior. Never duplicate task creation rules in controllers, routes, or frontend components."
---

# CasaSync Task Creation Service

## Purpose

Keep task creation centralized and consistent across CasaSync, whether the source is a form, AI suggestion, image extraction, or integration.

## Canonical Surfaces

- Backend service: `backend/app/services/task_service.py`.
- Backend route: `backend/app/routes/tasks.py`.
- Backend schema: `backend/app/schemas/task.py`.
- Backend model: `backend/app/models/task.py`.
- Frontend API client: `frontend/src/services/api.js`.
- Shared task UI: `frontend/src/components/TaskEditorModal.jsx`, `frontend/src/components/TaskList.jsx`, `frontend/src/pages/NewTask.jsx`, and `frontend/src/pages/Tasks.jsx`.

## Required Rules

- Resolve authenticated user and active family server-side.
- Validate that the creator belongs to the family.
- Validate assignees against family membership.
- Validate category ownership or allowed default category behavior.
- Normalize priority, status, dates, reminders, score, and recurrence according to existing CasaSync contracts.
- Keep ranking, notifications, reminder hydration, and task visibility behavior consistent with existing services.
- Return clear validation errors without leaking internal state.

## AI-Originated Tasks

- Accept only human-confirmed suggestions.
- Pass reviewed data through the same creation service as manual tasks.
- Store provenance only when there is a clear product need, and avoid storing raw AI prompts or image content.
- Avoid creating duplicates when importing multiple suggestions; surface likely duplicates to the review UI.

## Anti-Patterns

- Do not create tasks directly from a route with ad hoc SQLAlchemy writes.
- Do not create tasks directly from frontend-only logic.
- Do not bypass backend validation because the UI already filtered options.
- Do not create a separate AI task path that diverges from manual task creation.
- Do not silently assign tasks to users outside the active family.

## Verification

Test at least one successful create path and one rejected permission/validation path when the task changes behavior.
