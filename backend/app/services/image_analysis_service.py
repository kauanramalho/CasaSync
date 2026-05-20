from fastapi import UploadFile

from app.core.config import Settings
from app.schemas.image_analysis import ImageAnalysisResponse
from app.services.ai_vision_adapter import VisionAnalysisContext, get_ai_vision_adapter
from app.services.image_service import MAX_IMAGE_ANALYSIS_BYTES, read_validated_image_upload


async def parse_image_to_task_suggestions(
    *,
    file: UploadFile,
    family_id: str,
    settings: Settings,
) -> ImageAnalysisResponse:
    image = await read_validated_image_upload(
        file,
        max_bytes=MAX_IMAGE_ANALYSIS_BYTES,
        max_bytes_detail="A imagem deve ter no maximo 8 MB.",
    )
    adapter = get_ai_vision_adapter(settings.ai_vision_provider)
    return adapter.parse_image_to_task_suggestions(
        image,
        VisionAnalysisContext(
            family_id=family_id,
            provider=settings.ai_vision_provider,
        ),
    )
