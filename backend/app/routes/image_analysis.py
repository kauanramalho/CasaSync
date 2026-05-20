from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.core.config import Settings, get_settings
from app.core.deps import get_family_id
from app.schemas.image_analysis import ImageAnalysisResponse
from app.services.image_analysis_service import parse_image_to_task_suggestions


router = APIRouter(prefix="/image-analysis", tags=["image-analysis"])


@router.post("/task-suggestions", response_model=ImageAnalysisResponse)
async def analyze_task_suggestions(
    file: UploadFile = File(...),
    family_id: str = Depends(get_family_id),
    settings: Settings = Depends(get_settings),
):
    if not settings.ai_image_analysis_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Importacao por imagem desativada.",
        )
    return await parse_image_to_task_suggestions(
        file=file,
        family_id=family_id,
        settings=settings,
    )
