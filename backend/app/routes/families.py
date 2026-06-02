from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.rate_limit import check_rate_limit, client_identifier
from app.core.deps import get_current_user, get_family_id
from app.database.session import get_db
from app.models.user import User
from app.schemas.family import (
    FamilyActiveUpdate,
    FamilyCreate,
    FamilyJoin,
    FamilyJoinRequestRead,
    FamilyListItemRead,
    FamilyMemberRead,
    FamilyMemberUpdate,
    FamilyRead,
    FamilyUpdate,
)
from app.models.family import FamilyMember
from app.services.family_service import (
    create_family,
    decide_join_request,
    delete_family,
    get_active_family,
    get_family,
    leave_family,
    list_pending_join_requests,
    list_members,
    list_user_families,
    regenerate_invite_code,
    remove_member,
    request_join_family,
    set_active_family,
    update_family,
    update_member_role,
)


router = APIRouter(prefix="/families", tags=["families"])


@router.get("", response_model=list[FamilyListItemRead])
def list_my_families(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = []
    for family in list_user_families(db, current_user.id):
        member = (
            db.query(FamilyMember)
            .filter(FamilyMember.family_id == family.id, FamilyMember.user_id == current_user.id)
            .first()
        )
        item = FamilyListItemRead.model_validate(family).model_copy(update={"current_user_role": member.role if member else "member"})
        rows.append(item)
    return rows


@router.get("/current", response_model=FamilyRead)
def current_family(family_id: str = Depends(get_family_id), db: Session = Depends(get_db)):
    return get_family(db, family_id)


@router.get("/active", response_model=FamilyRead)
def active_family(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    family = get_active_family(db, current_user)
    if not family:
        raise HTTPException(status_code=404, detail="Crie ou entre em uma familia para continuar.")
    return family


@router.patch("/active", response_model=FamilyRead)
def update_active_family(
    payload: FamilyActiveUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return set_active_family(db, current_user, payload.family_id)


@router.post("", response_model=FamilyRead, status_code=201)
def create(payload: FamilyCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return create_family(db, payload, current_user.id)


@router.post("/join", response_model=FamilyJoinRequestRead)
def join(payload: FamilyJoin, request: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    check_rate_limit(
        f"families:join:{client_identifier(request)}:{current_user.id}",
        limit=8,
        window_seconds=600,
    )
    return request_join_family(db, payload.invite_code, current_user.id)


@router.get("/current/members", response_model=list[FamilyMemberRead])
def current_members(family_id: str = Depends(get_family_id), db: Session = Depends(get_db)):
    return list_members(db, family_id)


@router.get("/current/join-requests", response_model=list[FamilyJoinRequestRead])
def current_join_requests(
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    return list_pending_join_requests(db, family_id, current_user.id)


@router.post("/current/join-requests/{request_id}/approve", response_model=FamilyJoinRequestRead)
def approve_join_request(
    request_id: str,
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    return decide_join_request(db, family_id, current_user.id, request_id, True)


@router.post("/current/join-requests/{request_id}/reject", response_model=FamilyJoinRequestRead)
def reject_join_request(
    request_id: str,
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    return decide_join_request(db, family_id, current_user.id, request_id, False)


@router.post("/current/leave", status_code=204)
def leave_current_family(
    current_user: User = Depends(get_current_user),
    family_id: str = Depends(get_family_id),
    db: Session = Depends(get_db),
):
    leave_family(db, family_id, current_user.id)
    return None


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
