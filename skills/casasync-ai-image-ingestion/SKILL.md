---
name: casasync-ai-image-ingestion
description: "Use this skill whenever a CasaSync task involves upload or intake of images, screenshots, calendar photos, receipts, proofs, documents, files intended for AI analysis, image preview, temporary storage, upload endpoints, or image cleanup. Validate file type, size, format, security, preview behavior, temporary storage, retention, and deletion. Never permanently save an image unless there is a clear product need. Never expose image content or raw payloads in logs."
---

# CasaSync AI Image Ingestion

## Purpose

Accept images safely for CasaSync workflows without turning transient AI input into unnecessary permanent user data.

## Canonical Surfaces

Start from the existing image pipeline before adding anything new:

- Backend upload routes: `backend/app/routes/uploads.py`.
- Backend storage logic: `backend/app/services/image_service.py`.
- Backend image contracts: `backend/app/schemas/image.py`.
- Backend model: `backend/app/models/image_asset.py`.
- Frontend image field: `frontend/src/components/ImageAdjustField.jsx`.
- Frontend file helpers: `frontend/src/utils/files.js`.

## Intake Rules

- Accept only explicit user-selected files or images intentionally submitted by the user.
- Validate MIME type, extension, byte size, dimensions, and decode success server-side.
- Keep client-side compression/resizing for UX, but treat backend validation as authoritative.
- Prefer WebP or an existing optimized format when persistent storage is justified.
- Use temporary storage for AI extraction inputs unless a product requirement says the image must remain attached.
- Delete temporary files after extraction, timeout, cancellation, or failed review.
- Do not write raw base64 image payloads into entity JSON fields.

## Privacy Rules

- Never log image bytes, base64 strings, OCR text that contains sensitive data, signed URLs, or upload tokens.
- Scope any stored image to the authenticated user and active family when applicable.
- Return friendly validation errors without revealing internal paths or storage details.
- Reject oversized payloads before expensive AI or image processing work.
- Keep image URLs short and controlled; do not accept arbitrary `data:image/...` as persisted URLs.

## UX Requirements

- Show a preview only for a file that passed local type/size checks.
- Show a clear message when the file is unsupported, too large, or cannot be read.
- Preserve the current CasaSync visual language and toast/banner patterns.
- Do not claim the image was saved unless persistence actually succeeded.

## Verification

Verify successful preview, rejection of invalid files, rejection of oversized files, cleanup behavior, and absence of sensitive image data in logs or responses.
