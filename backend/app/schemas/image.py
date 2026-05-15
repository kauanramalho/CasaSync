from pydantic import BaseModel, Field, field_validator


MAX_IMAGE_URL_LENGTH = 2048
DATA_IMAGE_PREFIX = "data:image/"


def validate_image_url(value: str | None) -> str | None:
    if value is None:
        return None

    cleaned = value.strip()
    if not cleaned:
        return None

    lowered = cleaned.lower()
    if lowered.startswith(DATA_IMAGE_PREFIX):
        raise ValueError("Envie a imagem pelo upload antes de salvar. Base64 nao e aceito em image_url.")
    if len(cleaned) > MAX_IMAGE_URL_LENGTH:
        raise ValueError(f"A URL da imagem deve ter no maximo {MAX_IMAGE_URL_LENGTH} caracteres.")
    if not (lowered.startswith("https://") or lowered.startswith("http://") or cleaned.startswith("/")):
        raise ValueError("Use uma URL de imagem valida ou envie a imagem pelo upload.")
    return cleaned


class ImageUploadResponse(BaseModel):
    id: str
    url: str = Field(max_length=MAX_IMAGE_URL_LENGTH)
    content_type: str
    byte_size: int

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        return validate_image_url(value) or value
