---
name: casasync-human-review-gate
description: "Use this skill whenever CasaSync receives AI-generated, imported, extracted, inferred, OCR-derived, calendar-derived, or image-derived data that could become persisted tasks, events, categories, reminders, family data, or personal data. Require a human review screen or modal with edit, remove, confirm, cancel, clear messages, and explicit user intent. No AI suggestion may be saved without an explicit user click."
---

# CasaSync Human Review Gate

## Purpose

Insert a clear human checkpoint between AI suggestions and CasaSync persistence.

## Required UX

The review step must let the user:

- Review each suggested item before saving.
- Edit title, description, date, time, category, priority, assignee, recurrence, and notes when applicable.
- Remove one suggestion without losing the others.
- Cancel the entire operation without side effects.
- Confirm explicitly with a clear action button.
- See warnings for missing fields, low confidence, duplicates, invalid dates, or permission issues.

## Persistence Rules

- Do not save anything when extraction finishes.
- Do not save on modal open, preview render, auto-select, route transition, or optimistic UI intent.
- Save only after the user clicks the explicit confirmation control.
- Send only the reviewed payload to the backend.
- Re-run backend validation after confirmation.
- Show success only after API persistence succeeds.
- Keep the modal open or show inline recovery when persistence fails.

## Design Fit

- Use CasaSync's existing soft-card/glass styling and toast/banner feedback.
- Avoid browser `alert()`.
- Keep copy friendly and direct.
- Make low-confidence fields visible without making the interface feel alarming.
- Preserve accessibility: keyboard navigation, focus handling, labels, and disabled/loading states.

## Data Handling

Keep extracted suggestions in transient client or server state until confirmation. Do not persist raw AI output unless a reviewed domain record actually needs a safe subset of it.
