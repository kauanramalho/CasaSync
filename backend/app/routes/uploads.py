from typing import Literal

from fastapi import APIRouter, Depends, File, Query, Request, Response, UploadFile
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database.session import get_db
from app.models.user import User
from app.schemas.image import ImageUploadResponse
from app.services.family_service import get_primary_family, require_family_member
from app.services.image_service import create_image_asset, get_image_asset


router = APIRouter(prefix="/uploads", tags=["uploads"])


@router.post("/images", response_model=ImageUploadResponse, status_code=201)
async def upload_image(
    request: Request,
    scope: Literal["avatar", "family", "date", "system"] = Query(default="system"),
    family_id: str | None = Query(default=None),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    resolved_family_id = family_id
    if scope in {"family", "date"} and resolved_family_id is None:
        family = get_primary_family(db, current_user.id)
        resolved_family_id = family.id if family else None
    if resolved_family_id:
        require_family_member(db, resolved_family_id, current_user.id)

    asset = await create_image_asset(
        db,
        file=file,
        owner_user_id=current_user.id,
        family_id=resolved_family_id,
        scope=scope,
    )
    return ImageUploadResponse(
        id=asset.id,
        url=str(request.url_for("get_uploaded_image", image_id=asset.id)),
        content_type=asset.content_type,
        byte_size=asset.byte_size,
    )


@router.get("/images/{image_id}", name="get_uploaded_image")
def get_uploaded_image(image_id: str, db: Session = Depends(get_db)):
    asset = get_image_asset(db, image_id)
    return Response(
        content=asset.content,
        media_type=asset.content_type,
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "Content-Length": str(asset.byte_size),
        },
    )
