from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_family_id
from app.database.session import get_db
from app.models.user import User
from app.schemas.family import FamilyCreate, FamilyJoin, FamilyMemberRead, FamilyMemberUpdate, FamilyRead, FamilyUpdate
from app.services.family_service import (
    create_family,
    delete_family,
    get_family,
    join_family,
    list_members,
    list_user_families,
    regenerate_invite_code,
    remove_member,
    update_family,
    update_member_role,
)


router = APIRouter(prefix="/families", tags=["families"])


@router.get("", response_model=list[FamilyRead])
def list_my_families(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return list_user_families(db, current_user.id)


@router.get("/current", response_model=FamilyRead)
def current_family(family_id: str = Depends(get_family_id), db: Session = Depends(get_db)):
    return get_family(db, family_id)


@router.post("", response_model=FamilyRead, status_code=201)
def create(payload: FamilyCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return create_family(db, payload, current_user.id)


@router.post("/join", response_model=FamilyRead)
def join(payload: FamilyJoin, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return join_family(db, payload.invite_code, current_user.id)


@router.get("/current/members", response_model=list[FamilyMemberRead])
def current_members(family_id: str = Depends(get_family_id), db: Session = Depends(get_db)):
    return list_members(db, family_id)


@router.patch("/current", response_model=FamilyRead)
def update_current_family(
    payload: FamilyUpdate,
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    return update_family(db, family_id, current_user.id, payload)


@router.post("/current/regenerate-code", response_model=FamilyRead)
def regenerate_current_invite_code(
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    return regenerate_invite_code(db, family_id, current_user.id)


@router.patch("/current/members/{member_id}", response_model=FamilyMemberRead)
def update_current_member_role(
    member_id: str,
    payload: FamilyMemberUpdate,
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    return update_member_role(db, family_id, current_user.id, member_id, payload.role)


@router.delete("/current/members/{member_id}", status_code=204)
def remove_current_member(
    member_id: str,
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    remove_member(db, family_id, current_user.id, member_id)
    return None


@router.delete("/current", status_code=204)
def delete_current_family(
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    delete_family(db, family_id, current_user.id)
    return None
