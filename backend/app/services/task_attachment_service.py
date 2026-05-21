from pathlib import Path, PurePath
from re import sub
from urllib.parse import quote
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.task import Task, TaskAttachment
from app.services.family_service import require_family_member


MAX_TASK_ATTACHMENT_BYTES = 8 * 1024 * 1024
ALLOWED_ATTACHMENT_TYPES = {
    "image/png": {".png"},
    "image/jpeg": {".jpg", ".jpeg"},
    "image/webp": {".webp"},
    "application/pdf": {".pdf"},
}
MIME_TYPE_ALIASES = {
    "image/jpg": "image/jpeg",
}
STORAGE_EXTENSIONS = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "application/pdf": "pdf",
}


def _storage_root() -> Path:
    return Path(get_settings().task_attachment_storage_dir).expanduser().resolve()


def _resolve_attachment_path(attachment: TaskAttachment) -> Path:
    root = _storage_root()
    candidate = (root / attachment.family_id / attachment.task_id / attachment.stored_name).resolve()
    if candidate != root and root not in candidate.parents:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Armazenamento de anexo invalido.")
    return candidate


def _normalize_declared_type(content_type: str | None) -> str:
    declared_type = (content_type or "").split(";")[0].strip().lower()
    return MIME_TYPE_ALIASES.get(declared_type, declared_type)


def _detect_mime_type(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    return None


def _clean_original_name(filename: str | None, mime_type: str) -> str:
    fallback = f"anexo.{STORAGE_EXTENSIONS[mime_type]}"
    if not filename:
        return fallback

    name = PurePath(filename).name.strip() or fallback
    stem = PurePath(name).stem.strip() or "anexo"
    suffix = PurePath(name).suffix.lower()
    safe_stem = sub(r"[^A-Za-z0-9._-]+", "-", stem).strip(".-_") or "anexo"
    safe_name = f"{safe_stem[:140]}{suffix}" if suffix else safe_stem[:150]
    return safe_name[:180] or fallback


def _validate_extension(filename: str | None, mime_type: str) -> None:
    if not filename:
        return
    suffix = PurePath(filename).suffix.lower()
    if suffix not in ALLOWED_ATTACHMENT_TYPES[mime_type]:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Use apenas imagens PNG, JPG, JPEG, WEBP ou arquivos PDF.",
        )


def _get_task_for_family(db: Session, family_id: str, task_id: str) -> Task:
    task = db.query(Task).filter(Task.id == task_id, Task.family_id == family_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tarefa nao encontrada.")
    return task


async def read_validated_task_attachment(file: UploadFile) -> tuple[bytes, str, str]:
    declared_type = _normalize_declared_type(file.content_type)
    if declared_type not in ALLOWED_ATTACHMENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Use apenas imagens PNG, JPG, JPEG, WEBP ou arquivos PDF.",
        )

    data = await file.read(MAX_TASK_ATTACHMENT_BYTES + 1)
    if len(data) > MAX_TASK_ATTACHMENT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="O anexo deve ter no maximo 8 MB.",
        )
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selecione um arquivo para anexar.")

    detected_type = _detect_mime_type(data)
    if detected_type not in ALLOWED_ATTACHMENT_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="O arquivo enviado nao parece ser uma imagem ou PDF valido.")
    if detected_type != declared_type:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="O tipo real do arquivo nao confere com o arquivo enviado.")

    _validate_extension(file.filename, detected_type)
    original_name = _clean_original_name(file.filename, detected_type)
    return data, detected_type, original_name


async def create_task_attachment(
    db: Session,
    *,
    family_id: str,
    task_id: str,
    uploaded_by_id: str,
    file: UploadFile,
) -> TaskAttachment:
    require_family_member(db, family_id, uploaded_by_id)
    task = _get_task_for_family(db, family_id, task_id)
    data, mime_type, original_name = await read_validated_task_attachment(file)

    attachment = TaskAttachment(
        task_id=task.id,
        family_id=family_id,
        uploaded_by_id=uploaded_by_id,
        original_name=original_name,
        stored_name=f"{uuid4().hex}.{STORAGE_EXTENSIONS[mime_type]}",
        mime_type=mime_type,
        size=len(data),
    )
    path = _resolve_attachment_path(attachment)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)

    try:
        db.add(attachment)
        db.commit()
        db.refresh(attachment)
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return attachment


def list_task_attachments(db: Session, *, family_id: str, task_id: str) -> list[TaskAttachment]:
    _get_task_for_family(db, family_id, task_id)
    return (
        db.query(TaskAttachment)
        .filter(TaskAttachment.family_id == family_id, TaskAttachment.task_id == task_id)
        .order_by(TaskAttachment.created_at.asc())
        .all()
    )


def get_task_attachment(db: Session, *, family_id: str, task_id: str, attachment_id: str) -> TaskAttachment:
    _get_task_for_family(db, family_id, task_id)
    attachment = (
        db.query(TaskAttachment)
        .filter(
            TaskAttachment.id == attachment_id,
            TaskAttachment.task_id == task_id,
            TaskAttachment.family_id == family_id,
        )
        .first()
    )
    if not attachment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Anexo nao encontrado.")
    return attachment


def get_task_attachment_file(db: Session, *, family_id: str, task_id: str, attachment_id: str) -> tuple[TaskAttachment, Path]:
    attachment = get_task_attachment(db, family_id=family_id, task_id=task_id, attachment_id=attachment_id)
    path = _resolve_attachment_path(attachment)
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Anexo nao encontrado.")
    return attachment, path


def safe_content_disposition(filename: str) -> str:
    ascii_name = sub(r"[^A-Za-z0-9._-]+", "-", filename).strip(".-_") or "anexo"
    return f"inline; filename=\"{ascii_name[:180]}\"; filename*=UTF-8''{quote(filename)}"


def delete_attachment_file(attachment: TaskAttachment) -> None:
    _resolve_attachment_path(attachment).unlink(missing_ok=True)


def collect_attachment_file_paths(attachments: list[TaskAttachment]) -> list[Path]:
    return [_resolve_attachment_path(attachment) for attachment in attachments]


def delete_attachment_paths(paths: list[Path]) -> None:
    for path in paths:
        path.unlink(missing_ok=True)


def delete_task_attachment(db: Session, *, family_id: str, task_id: str, attachment_id: str) -> None:
    attachment = get_task_attachment(db, family_id=family_id, task_id=task_id, attachment_id=attachment_id)
    path = _resolve_attachment_path(attachment)
    db.delete(attachment)
    db.commit()
    path.unlink(missing_ok=True)


def delete_attachment_files(attachments: list[TaskAttachment]) -> None:
    delete_attachment_paths(collect_attachment_file_paths(attachments))
