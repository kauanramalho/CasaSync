# Task Attachments

## Current Strategy

Task attachments are stored as private local files in development, with metadata in the `task_attachments` table.

- Default local directory: `backend/storage/task_attachments`.
- Optional override: `TASK_ATTACHMENT_STORAGE_DIR`.
- Files are organized internally by `family_id/task_id/stored_name`.
- API responses never expose the physical path or internal stored filename.
- Uploaded files are ignored by git through `backend/storage/`.

## Allowed Files

The backend accepts only:

- `image/png`
- `image/jpeg`
- `image/jpg` as a JPEG alias
- `image/webp`
- `application/pdf`

The limit is 8 MB per attachment.

Validation checks the declared MIME type, extension, byte size, and real file signature. Frontend validation is only a convenience layer.

## Security Rules

- Every attachment must belong to an authenticated user, active family, and existing task.
- Download, list, upload, and delete endpoints resolve the task inside the active family.
- Original filenames are sanitized before metadata is saved.
- Stored filenames are generated with random identifiers.
- Raw file contents, physical paths, and storage internals must not be logged or returned.

## Future External Storage

For production scale, move the file bytes to private object storage such as S3, Supabase Storage, or Cloudinary private assets.

Recommended next step:

- Keep `task_attachments` as the metadata table.
- Replace local path resolution with a storage adapter.
- Store only a private storage key in the database.
- Generate short-lived signed URLs server-side after validating task and family permissions.
- Keep upload/delete flowing through the same backend endpoints so the frontend contract does not need to know the provider.
