from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_family_id
from app.database.session import get_db
from app.schemas.dashboard import DashboardRead
from app.services.dashboard_service import get_dashboard


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardRead)
def read_dashboard(family_id: str = Depends(get_family_id), db: Session = Depends(get_db)):
    return get_dashboard(db, family_id)

