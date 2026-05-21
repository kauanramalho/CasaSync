---
name: casasync-auth-login-username
description: "Use this skill whenever a CasaSync task involves authentication, login, signup, username, email, credentials, user validation, session entry, or changes to the CasaSync auth flow. Preserve existing email login while adding username-compatible behavior safely."
---

# CasaSync Auth Login Username

## Purpose

Protect CasaSync authentication when changing login, signup, username, email, credentials, or user validation behavior.

## Required Map

Before editing auth code, inspect the current flow:

- Frontend login, signup, verification, auth hooks, and API client under `frontend/src`.
- Backend auth routes under `backend/app/routes/auth.py`.
- Auth and password helpers under `backend/app/core` and `backend/app/services/auth_service.py`.
- User model and schemas under `backend/app/models/user.py` and `backend/app/schemas`.
- Session, 2FA, JWT token version, active user checks, and email verification rules.
- Database compatibility path in `backend/app/database/init_db.py` before adding or changing columns.

## Rules

- Preserve login by email exactly unless the user explicitly asks to remove it.
- Make username login coexist with email login.
- Normalize username server-side before lookup or persistence.
- Enforce username uniqueness server-side.
- Validate username length, allowed characters, and reserved/empty values in backend schemas or services.
- Keep error messages generic for invalid credentials; do not reveal whether email, username, or password was wrong.
- Keep backend as the source of truth; frontend validation is only UX.
- Preserve existing users and avoid destructive database changes.
- Use additive migrations or compatibility upgrades when a new field is required.
- Do not log passwords, credential payloads, tokens, 2FA codes, or raw auth errors.

## Implementation Guidance

- Reuse the existing auth service and security helpers instead of duplicating password or token logic.
- Prefer a single credential field in login payloads only when it remains backward-compatible with current email login.
- Add indexes or uniqueness constraints carefully and handle existing rows with null username.
- Keep 2FA, token invalidation, logout, password change, and account deletion behavior intact.
- If a broad auth refactor seems necessary, stop and explain the scope before editing.

## Verification

Before finishing an auth change, test:

- Existing email login.
- New username login, when implemented.
- Signup with valid username, when implemented.
- Duplicate username rejection.
- Invalid credentials with safe generic message.
- Existing user without username, if compatibility matters.
- Logout/session invalidation still works.
