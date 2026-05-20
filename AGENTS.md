# CasaSync Agent Rules

These rules are permanent guardrails for Codex work in this repository.

## Project-Specific Skills

Use the local skills in `skills/` when a task matches their descriptions:

- `casasync-architecture-guardian`
- `casasync-ai-image-ingestion`
- `casasync-vision-extraction-schema`
- `casasync-task-creation-service`
- `casasync-human-review-gate`
- `casasync-google-calendar-sync`
- `casasync-security-privacy`
- `casasync-tests-quality-gate`

## Permanent Rules

- Never change authentication, family, permissions, or database behavior without first mapping the impact.
- Never save AI-derived data without human review.
- Never commit `.env`, tokens, user images, OAuth secrets, refresh tokens, API keys, or credentials.
- Every new feature must have a safe fallback.
- Every external integration must stay behind a feature flag.
- Prefer reusable services over duplicated logic in routes, controllers, pages, or components.
- Treat frontend validation as UX only; enforce sensitive rules on the backend.
- Keep family ownership and permission checks server-side.
- Do not expose images, tokens, personal data, provider responses, or raw AI payloads in logs.
- At the end of each task, report files changed, risks, tests executed, limitations, and next steps.

## CasaSync Architecture Reminders

- Backend business logic belongs in `backend/app/services`.
- Backend HTTP surfaces belong in `backend/app/routes`.
- Persistent entities belong in `backend/app/models`.
- API contracts belong in `backend/app/schemas`.
- Shared frontend API behavior belongs in `frontend/src/services/api.js`.
- Prefer shared frontend components/hooks/utilities over page-specific duplicates.
