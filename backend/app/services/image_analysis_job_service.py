import json
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.database.session import SessionLocal
from app.models.image_analysis_job import AiImageAnalysisJob
from app.models.user import User
from app.schemas.image_analysis import ImageAnalysisFileError, ImageAnalysisJobCreated, ImageAnalysisJobStatus, ImageAnalysisResponse
from app.services.image_analysis_service import MAX_IMAGE_ANALYSIS_FILES, parse_validated_images_to_task_suggestions
from app.services.image_service import MAX_IMAGE_ANALYSIS_BYTES, ValidatedImageUpload, read_validated_image_upload


TERMINAL_JOB_STATUSES = {"ready_for_review", "completed", "failed", "cancelled"}
JOB_STATUS_MESSAGES = {
    "pending": "Analise adicionada a fila.",
    "processing": "Preparando imagens com seguranca.",
    "extracting": "Interpretando imagem com IA.",
    "validating": "Organizando sugestoes e validando resultado.",
    "ready_for_review": "Sugestoes prontas para revisao.",
    "completed": "Processamento concluido.",
    "failed": "Nao conseguimos concluir a analise.",
    "cancelled": "Analise cancelada.",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _job_storage_dir(settings: Settings, job_id: str) -> Path:
    return settings.ai_image_job_storage_dir / job_id


def _image_extension(content_type: str) -> str:
    return {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}.get(content_type, "img")


def _safe_json_loads(value: str | None, fallback):
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def _safe_error_message(exc: Exception) -> str:
    detail = getattr(exc, "detail", None)
    if isinstance(detail, str) and detail.strip():
        return detail.strip()[:300]
    message = str(exc).strip()
    if message:
        return message[:300]
    return "Nao conseguimos concluir a analise. Tente novamente com uma imagem mais nitida."


def _set_job_state(
    db: Session,
    job: AiImageAnalysisJob,
    *,
    status_value: str,
    progress: int,
    message: str | None = None,
    processed_count: int | None = None,
    suggestions_count: int | None = None,
) -> None:
    job.status = status_value
    job.progress = max(0, min(100, int(progress)))
    job.message = message or JOB_STATUS_MESSAGES.get(status_value)
    if processed_count is not None:
        job.processed_count = processed_count
    if suggestions_count is not None:
        job.suggestions_count = suggestions_count
    if status_value in {"processing", "extracting"} and not job.started_at:
        job.started_at = _now()
    if status_value in TERMINAL_JOB_STATUSES:
        job.completed_at = _now()
    db.add(job)
    db.commit()


def _cleanup_job_storage(path_value: str | None) -> None:
    if not path_value:
        return
    path = Path(path_value)
    if path.exists() and path.is_dir():
        shutil.rmtree(path, ignore_errors=True)


def _load_job_images(job: AiImageAnalysisJob) -> list[ValidatedImageUpload]:
    storage_dir = Path(job.storage_path or "")
    metadata = _safe_json_loads(job.image_metadata_json, [])
    images: list[ValidatedImageUpload] = []
    for item in metadata:
        stored_name = item.get("storedName")
        content_type = item.get("contentType")
        if not stored_name or not content_type:
            continue
        image_path = storage_dir / stored_name
        if not image_path.exists() or not image_path.is_file():
            continue
        content = image_path.read_bytes()
        images.append(
            ValidatedImageUpload(
                filename=item.get("filename"),
                content_type=content_type,
                byte_size=len(content),
                content=content,
            )
        )
    return images


async def create_image_analysis_job(
    db: Session,
    *,
    files: list[UploadFile],
    family_id: str,
    user_id: str,
    settings: Settings,
    image_context: str | None = None,
) -> ImageAnalysisJobCreated:
    if not files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selecione pelo menos uma imagem para enviar.")
    if len(files) > MAX_IMAGE_ANALYSIS_FILES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Envie no maximo {MAX_IMAGE_ANALYSIS_FILES} imagens por vez.")

    validated_images: list[ValidatedImageUpload] = []
    validation_errors: list[str] = []
    for file in files:
        try:
            validated_images.append(
                await read_validated_image_upload(
                    file,
                    max_bytes=MAX_IMAGE_ANALYSIS_BYTES,
                    max_bytes_detail="A imagem deve ter no maximo 8 MB.",
                )
            )
        except Exception as exc:  # noqa: BLE001 - keep user-facing upload errors friendly.
            filename = (file.filename or "Imagem")[:80]
            validation_errors.append(f"{filename}: {_safe_error_message(exc)}")

    if not validated_images:
        detail = " ".join(validation_errors[:3]) or "Nenhuma imagem valida ficou pronta para interpretacao."
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    expires_at = _now() + timedelta(hours=max(1, int(settings.ai_image_job_retention_hours or 24)))
    job = AiImageAnalysisJob(
        family_id=family_id,
        user_id=user_id,
        status="pending",
        progress=5,
        message="Enviando imagem para processamento seguro.",
        image_count=len(validated_images),
        processed_count=0,
        suggestions_count=0,
        image_context=image_context,
        expires_at=expires_at,
    )
    db.add(job)
    db.flush()

    job_dir = _job_storage_dir(settings, job.id)
    job_dir.mkdir(parents=True, exist_ok=True)
    metadata = []
    for index, image in enumerate(validated_images):
        stored_name = f"{index + 1:02d}-{uuid4().hex}.{_image_extension(image.content_type)}"
        (job_dir / stored_name).write_bytes(image.content)
        metadata.append(
            {
                "storedName": stored_name,
                "filename": image.filename,
                "contentType": image.content_type,
                "byteSize": image.byte_size,
            }
        )

    job.storage_path = str(job_dir)
    job.image_metadata_json = json.dumps(metadata, ensure_ascii=True)
    if validation_errors:
        job.image_errors_json = json.dumps(validation_errors[:10], ensure_ascii=True)
        job.message = "Algumas imagens foram ignoradas; as imagens validas continuam em processamento."
    db.commit()
    db.refresh(job)
    return ImageAnalysisJobCreated(
        jobId=job.id,
        status=job.status,
        progress=job.progress,
        message=job.message or JOB_STATUS_MESSAGES["pending"],
        totalImages=job.image_count,
    )


def process_image_analysis_job(job_id: str) -> None:
    settings = get_settings()
    db = SessionLocal()
    try:
        job = db.query(AiImageAnalysisJob).filter(AiImageAnalysisJob.id == job_id).first()
        if not job or job.status in TERMINAL_JOB_STATUSES:
            return

        _set_job_state(
            db,
            job,
            status_value="processing",
            progress=15,
            message="Preparando imagens temporarias para analise.",
        )
        images = _load_job_images(job)
        if not images:
            raise RuntimeError("As imagens temporarias nao estao mais disponiveis. Envie novamente.")

        _set_job_state(
            db,
            job,
            status_value="extracting",
            progress=35,
            message="Interpretando imagem com IA. Imagens com muitas datas podem levar mais tempo.",
        )
        user = db.query(User).filter(User.id == job.user_id, User.is_active.is_(True)).first()
        custom_instructions = user.ai_task_import_instructions if user else None
        result = parse_validated_images_to_task_suggestions(
            images=images,
            family_id=job.family_id,
            settings=settings,
            custom_instructions=custom_instructions,
            image_context=job.image_context,
            db=db,
        )

        stored_errors = _safe_json_loads(job.image_errors_json, [])
        if stored_errors:
            result.imageErrors = [
                *result.imageErrors,
                *[ImageAnalysisFileError(filename=None, reason=str(error)[:300]) for error in stored_errors],
            ][:10]
            result.warnings = list(dict.fromkeys([*result.warnings, "Algumas imagens foram ignoradas antes da analise."]))[:10]

        _set_job_state(
            db,
            job,
            status_value="validating",
            progress=80,
            message="Organizando sugestoes e preparando a revisao.",
            processed_count=result.totalImagesProcessed,
            suggestions_count=result.totalSuggestionsGenerated,
        )
        job.result_json = result.model_dump_json()
        _set_job_state(
            db,
            job,
            status_value="ready_for_review",
            progress=100,
            message=JOB_STATUS_MESSAGES["ready_for_review"],
            processed_count=result.totalImagesProcessed,
            suggestions_count=result.totalSuggestionsGenerated,
        )
    except Exception as exc:  # noqa: BLE001 - background job must surface safe failure state.
        job = db.query(AiImageAnalysisJob).filter(AiImageAnalysisJob.id == job_id).first()
        if job:
            job.error_message = _safe_error_message(exc)
            _set_job_state(
                db,
                job,
                status_value="failed",
                progress=100,
                message="Nao conseguimos concluir a analise. Voce pode tentar novamente ou enviar uma imagem mais nitida.",
            )
    finally:
        job = db.query(AiImageAnalysisJob).filter(AiImageAnalysisJob.id == job_id).first()
        if job:
            _cleanup_job_storage(job.storage_path)
            job.storage_path = None
            db.add(job)
            db.commit()
        db.close()


def get_image_analysis_job_status(
    db: Session,
    *,
    job_id: str,
    family_id: str,
    user_id: str,
) -> ImageAnalysisJobStatus:
    job = (
        db.query(AiImageAnalysisJob)
        .filter(AiImageAnalysisJob.id == job_id, AiImageAnalysisJob.family_id == family_id, AiImageAnalysisJob.user_id == user_id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analise de imagem nao encontrada.")

    result = ImageAnalysisResponse.model_validate_json(job.result_json) if job.result_json else None
    return ImageAnalysisJobStatus(
        jobId=job.id,
        status=job.status,
        progress=job.progress,
        message=job.message or JOB_STATUS_MESSAGES.get(job.status, "Processando imagem."),
        totalImages=job.image_count,
        processedImages=job.processed_count,
        totalSuggestionsGenerated=job.suggestions_count,
        createdAt=job.created_at,
        updatedAt=job.updated_at,
        completedAt=job.completed_at,
        result=result,
        error=job.error_message,
    )
