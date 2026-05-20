---
name: casasync-tests-quality-gate
description: "Use this skill before finalizing any CasaSync task, especially after code, docs, skills, configuration, frontend, backend, auth, task, image, AI, calendar, or database changes. Run the available tests, lint, build, validation commands, and focused flow checks that match the changed surfaces. Document limitations, files changed, risks, and next steps in the final response."
---

# CasaSync Tests Quality Gate

## Purpose

Finish CasaSync work with concrete verification instead of a vague "done".

## Choose Checks By Surface

- Frontend changes: run `npm.cmd run lint` and `npm.cmd run build` from `frontend` when available.
- Backend changes: use the project backend environment when available; prefer focused API/service tests or import/startup checks over global Python.
- Docs or skill-only changes: run the relevant structural validator, spell/format sanity checks, and `git diff --check`.
- Auth, family, permissions, images, AI, calendar, or database changes: add focused manual/API validation for the sensitive flow.

## Standard Windows Notes

- Use `npm.cmd` on Windows/PowerShell.
- Prefer the repo or service-local Python environment for backend checks.
- Avoid requiring production credentials for local verification.
- Do not claim production validation unless it was actually run against production.

## Required Final Report

Include:

- Files changed.
- Tests, lint, build, validators, or flow checks executed.
- Any check that could not be run and why.
- Residual risks or assumptions.
- Suggested next steps, especially for deployment, credentials, production checks, or manual QA.

## Quality Bar

If a requested change cannot be verified safely, report the limitation plainly and avoid overstating confidence.
