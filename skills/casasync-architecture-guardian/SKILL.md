---
name: casasync-architecture-guardian
description: "Use this skill whenever a CasaSync task involves structural changes, shared architecture, frontend/backend boundaries, services, routes, models, schemas, authentication, permissions, family ownership, database behavior, integrations, or changes that could affect existing flows. Before editing files, map the current frontend, backend, services, routes, models, auth, permissions, database, and local patterns. Prefer incremental, reversible, testable changes and preserve existing behavior."
---

# CasaSync Architecture Guardian

## Purpose

Protect CasaSync's full-stack structure before broad or risky changes. Use this as the first pass for changes that touch more than one layer or any sensitive domain.

## Required Map

Before editing any file, inspect the relevant current implementation:

- Frontend pages, components, hooks, and API client under `frontend/src`.
- Backend routes under `backend/app/routes`.
- Business rules under `backend/app/services`.
- Persistence contracts under `backend/app/models` and `backend/app/schemas`.
- Auth, current user, active family, and permissions under `backend/app/core` and existing services.
- Database initialization and migration assumptions under `backend/app/database`.
- Existing docs in `docs/ARCHITECTURE.md`, `docs/SECURITY_AUDIT.md`, and `docs/AUTOMATION_API.md` when relevant.

## Change Rules

- Keep routes thin; put reusable business logic in services.
- Keep frontend UI as a reflection of backend-validated state, not the only source of permission or validation.
- Avoid parallel implementations when an existing service, helper, hook, or component already owns the behavior.
- Do not rewrite auth, family membership, task ownership, ranking, reminders, or image handling as a side effect of an unrelated task.
- Prefer additive changes, explicit fallbacks, and small contracts that are easy to test.
- If a large refactor is required, stop and explain the scope before changing broad surfaces.

## Pre-Edit Checklist

- Identify the exact user flow and data flow being changed.
- Identify the canonical service or utility that should own the rule.
- Check whether the change affects current API responses, frontend state shape, or stored data.
- Check whether family scoping, permissions, or authentication are involved.
- Choose the narrowest reversible edit that satisfies the request.

## Handoff

In the final response, report the mapped impact, files changed, validation run, residual risks, and next steps. If no files were edited, say that clearly.
