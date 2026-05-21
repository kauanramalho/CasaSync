---
name: casasync-task-attachments
description: "Use this skill whenever a CasaSync task involves task attachments, file upload, image upload, PDF upload, file storage, attachment validation, preview, download, deletion, or linking files to tasks. Enforce backend validation, active-family ownership, and safe storage."
---

# CasaSync Task Attachments

## Purpose

Add or change CasaSync task attachments without weakening file validation, storage privacy, task ownership, or family boundaries.

## Required Map

Before editing attachment code, inspect:

- Task model, schemas, routes, and service under `backend/app/models/task.py`, `backend/app/schemas/task.py`, `backend/app/routes/tasks.py`, and `backend/app/services/task_service.py`.
- Existing upload/image handling under `backend/app/routes/uploads.py`, `backend/app/services/image_service.py`, and related models.
- Frontend task create/edit components and API client under `frontend/src`.
- Active family and permission checks under `backend/app/core/deps.py` and `backend/app/services/family_service.py`.
- Current local database upgrade pattern in `backend/app/database/init_db.py`.

## Rules

- Allow only safe attachment types: images and PDF.
- Validate declared MIME type, real file signature, extension, and size on the backend.
- Treat frontend file checks as UX only.
- Do not save a file unless it is linked to an authenticated user, active family, and task.
- Reject access to attachments from another family.
- Do not expose physical server paths or storage internals in API responses.
- Generate internal safe identifiers or names; never trust original filenames for storage paths.
- Store original filenames only as sanitized metadata when useful.
- Provide deletion/removal of attachments.
- Avoid logging file contents, raw binary data, private URLs, or user documents.
- Document local storage behavior and future external storage strategy.

## Implementation Guidance

- Reuse existing image upload validation where it fits, but extend safely for PDF instead of relaxing image rules.
- Keep attachment business logic in backend services, not route handlers or frontend components.
- Prefer metadata records that include task id, family id, owner user id, content type, byte size, and storage key/id.
- Make download/preview endpoints resolve permission server-side every time.
- Keep new APIs additive so existing task creation and editing continue to work.

## Verification

Before finishing an attachment change, test:

- Valid image upload.
- Valid PDF upload.
- Invalid type rejection.
- Oversized file rejection.
- Attachment removal.
- Download/preview by authorized family member.
- Access attempt from another family.
- Existing task create/edit flows without attachments.
