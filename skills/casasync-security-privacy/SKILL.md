---
name: casasync-security-privacy
description: "Use this skill for any CasaSync change involving AI, images, uploads, authentication, login, 2FA, sessions, family membership, permissions, Google Agenda, integrations, personal data, secrets, .env, tokens, logs, storage, database ownership, or cross-family data exposure. Protect environment files, credentials, images, logs, permissions, family ownership, and personal data. Prefer server-side validation and safe user-facing messages."
---

# CasaSync Security Privacy

## Purpose

Keep CasaSync privacy and permission boundaries intact while changing sensitive features.

## Sensitive Areas

Treat these areas as high risk:

- Authentication, JWT, 2FA, sessions, password handling, and account deletion.
- Family creation, invitation, membership, active family, and ownership checks.
- Tasks, categories, rankings, reminders, images, calendar events, and personal notes.
- `.env`, OAuth credentials, SMTP config, API keys, tokens, refresh tokens, and provider secrets.
- Logs, error messages, analytics, browser storage, and uploaded files.

## Required Protections

- Enforce permissions server-side; frontend checks are convenience only.
- Scope data by authenticated user and active family.
- Reject cross-family object access, hidden IDs, and client-provided ownership claims.
- Keep secrets out of git, logs, UI errors, tests, fixtures, docs, and screenshots.
- Do not log raw images, AI prompts containing personal data, OCR dumps, tokens, headers, or database URLs.
- Use generic safe messages for users and keep detailed diagnostics internal.
- Fail closed when auth, feature flags, provider config, or family context is missing.

## AI and Image Rules

- Do not persist AI-derived personal data without human review.
- Keep image ingestion temporary unless persistence is explicitly required.
- Strip or avoid unnecessary metadata where feasible.
- Store only the minimum fields needed for the CasaSync feature.
- Do not expose model prompts, provider responses, or confidence internals unless they are intentionally part of review UI.

## Pre-Final Review

Before handoff, inspect the diff for accidental secrets, `.env` edits, debug logs, permissive auth changes, client-only validation, and family ownership gaps.
