from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.deps import get_current_user, get_family_id
from app.database.session import get_db
from app.models.user import User
from app.schemas.image_analysis import ImageAnalysisPreferences, ImageAnalysisPreferencesUpdate, ImageAnalysisResponse
from app.services.image_analysis_service import parse_images_to_task_suggestions


router = APIRouter(prefix="/image-analysis", tags=["image-analysis"])


@router.post("/task-suggestions", response_model=ImageAnalysisResponse)
async def analyze_task_suggestions(
    file: UploadFile | None = File(default=None),
    files: list[UploadFile] | None = File(default=None),
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    settings: Settings = Depends(get_settings),
):
    if not settings.ai_image_analysis_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Importacao por imagem desativada.",
        )
    uploaded_files = []
    if file is not None:
        uploaded_files.append(file)
    if files:
        uploaded_files.extend(files)
    if not uploaded_files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selecione pelo menos uma imagem para enviar.")

    return await parse_images_to_task_suggestions(
        files=uploaded_files,
        family_id=family_id,
        settings=settings,
        custom_instructions=current_user.ai_task_import_instructions,
    )


@router.get("/preferences", response_model=ImageAnalysisPreferences)
def get_image_analysis_preferences(current_user: User = Depends(get_current_user)):
    return ImageAnalysisPreferences(customInstructions=current_user.ai_task_import_instructions)


@router.put("/preferences", response_model=ImageAnalysisPreferences)
def update_image_analysis_preferences(
    payload: ImageAnalysisPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.ai_task_import_instructions = payload.customInstructions
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return ImageAnalysisPreferences(customInstructions=current_user.ai_task_import_instructions)


@router.delete("/preferences", response_model=ImageAnalysisPreferences)
def clear_image_analysis_preferences(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.ai_task_import_instructions = None
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return ImageAnalysisPreferences(customInstructions=None)
