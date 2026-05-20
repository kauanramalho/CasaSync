---
name: casasync-google-calendar-sync
description: "Use this skill whenever a CasaSync task involves Google Calendar, Google Agenda, OAuth, calendar events, calendar import/export, calendar sync, external integration settings, Calendar API service boundaries, or event reminders. Implement only safe architecture unless explicitly asked for live integration: feature flag, service abstraction, OAuth-ready contracts, secure integration points, and no real credentials in code. Never commit tokens, client secrets, refresh tokens, or user calendar data."
---

# CasaSync Google Calendar Sync

## Purpose

Prepare Google Agenda integration safely without hardcoding credentials or forcing live external access.

## Existing Surfaces

- Backend integration routes: `backend/app/routes/integrations.py`.
- Backend calendar service: `backend/app/services/calendar_service.py`.
- Backend integration schema/model: `backend/app/schemas/integration.py` and `backend/app/models/integration.py`.
- Frontend calendar screen: `frontend/src/pages/Calendar.jsx`.
- Frontend API client: `frontend/src/services/api.js`.
- Docs: `docs/AUTOMATION_API.md` when automation or integration endpoints are involved.

## Architecture Rules

- Put external calendar behavior behind a feature flag or config flag.
- Keep OAuth initiation, callback handling, token storage, and event sync behind backend service abstractions.
- Store only encrypted or otherwise protected token material when real auth is later implemented.
- Keep frontend states ready for connected, disconnected, disabled, error, and loading.
- Use server-side ownership checks for user and active family before any calendar operation.
- Keep sync idempotent; prefer update-or-skip behavior over blind event creation.

## Credential Rules

- Do not commit `.env` values, OAuth client secrets, refresh tokens, access tokens, calendar IDs, or sample secrets.
- Document required environment variable names in examples only, with placeholder values.
- Never log OAuth codes, tokens, authorization headers, or full provider responses.
- Fail closed when required config is missing.

## Event Safety

- Do not create live calendar events during architecture work.
- If live writes are later requested, check for existing events before creating duplicates.
- Use clear timezone handling; default to the user's CasaSync context only when confirmed.
- Treat external provider failures as recoverable UI states.

## Handoff

Report exactly what was prepared, which feature flag guards it, which credentials are intentionally absent, and what remains before live Google Agenda sync can be enabled.
