from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.models.image_asset import ImageAsset


MAX_IMAGE_UPLOAD_BYTES = 600 * 1024
ALLOWED_IMAGE_TYPES = {
    "image/webp": "webp",
    "image/jpeg": "jpeg",
    "image/png": "png",
}


def _detect_image_type(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


async def create_image_asset(
    db: Session,
    *,
    file: UploadFile,
    owner_user_id: str,
    scope: str,
    family_id: str | None = None,
) -> ImageAsset:
    declared_type = (file.content_type or "").split(";")[0].strip().lower()
    if declared_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Use uma imagem PNG, JPG ou WEBP.",
        )

    data = await file.read(MAX_IMAGE_UPLOAD_BYTES + 1)
    if len(data) > MAX_IMAGE_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="A imagem otimizada deve ter no maximo 600 KB.",
        )
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selecione uma imagem para enviar.")

    detected_type = _detect_image_type(data)
    if detected_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="O arquivo enviado nao parece ser uma imagem valida.")
    if detected_type != declared_type:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="O tipo real da imagem nao confere com o arquivo enviado.")

    asset = ImageAsset(
        owner_user_id=owner_user_id,
        family_id=family_id,
        scope=scope,
        content_type=detected_type,
        original_filename=(file.filename or "")[:255] or None,
        byte_size=len(data),
        content=data,
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
