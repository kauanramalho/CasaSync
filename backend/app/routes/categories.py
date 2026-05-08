from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_family_id
from app.database.session import get_db
from app.schemas.category import CategoryCreate, CategoryRead
from app.services.category_service import create_category, ensure_default_categories, list_categories


router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryRead])
def list_all(family_id: str = Depends(get_family_id), db: Session = Depends(get_db)):
    ensure_default_categories(db, family_id)
    return list_categories(db, family_id)


@router.post("", response_model=CategoryRead, status_code=201)
def create(payload: CategoryCreate, family_id: str = Depends(get_family_id), db: Session = Depends(get_db)):
    return create_category(db, family_id, payload)

