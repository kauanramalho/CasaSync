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
- `casasync-auth-login-username`
- `casasync-notifications-reminders`
- `casasync-task-attachments`
- `casasync-security-privacy`
- `casasync-tests-quality-gate`

## Permanent Rules

- Before implementing, read the relevant files in `docs/codex-skills/` and keep the change aligned with those guides.
- Preserve the current CasaSync architecture unless the user explicitly asks for a structural refactor.
- Never change authentication, family, permissions, or database behavior without first mapping the impact.
- Authentication changes require backend validation and must preserve the existing email login flow.
- Never save AI-derived data without human review.
- Never commit `.env`, tokens, user images, OAuth secrets, refresh tokens, API keys, or credentials.
- Never commit email, push, OpenAI, Google, SMTP, OAuth, or external-provider credentials.
- Notifications must include duplicate-control rules before delivery is added or changed.
- Attachments must validate type and size on the backend and respect the active family boundary.
- Every new feature must have a safe fallback.
- Every external integration must stay behind a feature flag.
- Do not break the current deploy/runtime configuration; production URLs and env vars must stay explicit and safe.
- Do not deploy automatically unless the user explicitly asks for deployment.
- Prefer reusable services over duplicated logic in routes, controllers, pages, or components.
- Treat frontend validation as UX only; enforce sensitive rules on the backend.
- Keep family ownership and permission checks server-side.
- Preserve compatibility with existing data, including users without optional new fields and tasks without optional relationships.
- Keep new and changed UI responsive across desktop, notebook, tablet, and mobile.
- Do not expose images, tokens, personal data, provider responses, or raw AI payloads in logs.
- Run available lint/build/tests or document clearly why they were not run.
- At the end of each task, report files changed, commands executed, risks, tests executed, limitations, and next steps.

## CasaSync Architecture Reminders

- Backend business logic belongs in `backend/app/services`.
- Backend HTTP surfaces belong in `backend/app/routes`.
- Persistent entities belong in `backend/app/models`.
- API contracts belong in `backend/app/schemas`.
- Shared frontend API behavior belongs in `frontend/src/services/api.js`.
- Prefer shared frontend components/hooks/utilities over page-specific duplicates.
