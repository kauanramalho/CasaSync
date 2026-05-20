from dataclasses import dataclass
from pathlib import PurePath

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.models.image_asset import ImageAsset


MAX_IMAGE_UPLOAD_BYTES = 600 * 1024
MAX_IMAGE_ANALYSIS_BYTES = 8 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {
    "image/webp": "webp",
    "image/jpeg": "jpeg",
    "image/png": "png",
}
ALLOWED_IMAGE_EXTENSIONS = {".webp", ".jpg", ".jpeg", ".png"}


@dataclass(frozen=True)
class ValidatedImageUpload:
    filename: str | None
    content_type: str
    byte_size: int
    content: bytes


def _detect_image_type(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def _validate_image_extension(filename: str | None) -> None:
    if not filename:
        return
    suffix = PurePath(filename).suffix.lower()
    if suffix not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Use uma imagem PNG, JPG, JPEG ou WEBP.",
        )


async def read_validated_image_upload(
    file: UploadFile,
    *,
    max_bytes: int = MAX_IMAGE_UPLOAD_BYTES,
    max_bytes_detail: str = "A imagem otimizada deve ter no maximo 600 KB.",
) -> ValidatedImageUpload:
    declared_type = (file.content_type or "").split(";")[0].strip().lower()
    if declared_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Use uma imagem PNG, JPG ou WEBP.",
        )
    _validate_image_extension(file.filename)

    data = await file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=max_bytes_detail,
        )
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selecione uma imagem para enviar.")

    detected_type = _detect_image_type(data)
    if detected_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="O arquivo enviado nao parece ser uma imagem valida.")
    if detected_type != declared_type:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="O tipo real da imagem nao confere com o arquivo enviado.")

    return ValidatedImageUpload(
        filename=(file.filename or "")[:255] or None,
        content_type=detected_type,
        byte_size=len(data),
        content=data,
    )


async def create_image_asset(
    db: Session,
    *,
    file: UploadFile,
    owner_user_id: str,
    scope: str,
    family_id: str | None = None,
) -> ImageAsset:
    upload = await read_validated_image_upload(file)

    asset = ImageAsset(
        owner_user_id=owner_user_id,
        family_id=family_id,
        scope=scope,
        content_type=upload.content_type,
        original_filename=upload.filename,
        byte_size=upload.byte_size,
        content=upload.content,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


def get_image_asset(db: Session, image_id: str) -> ImageAsset:
    asset = db.query(ImageAsset).filter(ImageAsset.id == image_id).first()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imagem nao encontrada.")
    return asset
