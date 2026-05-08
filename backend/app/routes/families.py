from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_family_id
from app.database.session import get_db
from app.models.user import User
from app.schemas.family import FamilyCreate, FamilyJoin, FamilyMemberRead, FamilyRead
from app.services.family_service import create_family, join_family, list_members, list_user_families


router = APIRouter(prefix="/families", tags=["families"])


@router.get("", response_model=list[FamilyRead])
def list_my_families(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return list_user_families(db, current_user.id)


@router.post("", response_model=FamilyRead, status_code=201)
def create(payload: FamilyCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return create_family(db, payload, current_user.id)


@router.post("/join", response_model=FamilyRead)
def join(payload: FamilyJoin, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return join_family(db, payload.invite_code, current_user.id)


@router.get("/current/members", response_model=list[FamilyMemberRead])
def current_members(family_id: str = Depends(get_family_id), db: Session = Depends(get_db)):
    return list_members(db, family_id)

