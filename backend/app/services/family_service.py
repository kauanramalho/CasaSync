import secrets
import string
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.enums import FamilyRole
from app.models.family import Family, FamilyJoinRequest, FamilyMember
from app.models.task import Task, TaskAssignee
from app.models.user import User
from app.schemas.family import FamilyCreate, FamilyUpdate
from app.services.category_service import ensure_default_categories


JOIN_REQUEST_TTL_DAYS = 7


def _generate_invite_code(length: int = 8) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _unique_invite_code(db: Session) -> str:
    for _ in range(10):
        code = _generate_invite_code()
        if not db.query(Family).filter(Family.invite_code == code).first():
            return code
    raise RuntimeError("Nao foi possivel gerar um codigo de convite unico.")


def _join_request_expiration() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=JOIN_REQUEST_TTL_DAYS)

def _as_aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _refresh_expired_join_requests(
    db: Session,
    *,
    family_id: str | None = None,
    requester_id: str | None = None,
) -> None:
    now = datetime.now(timezone.utc)
    query = db.query(FamilyJoinRequest).filter(FamilyJoinRequest.status == "pending")
    if family_id:
        query = query.filter(FamilyJoinRequest.family_id == family_id)
    if requester_id:
        query = query.filter(FamilyJoinRequest.requester_id == requester_id)

    changed = False
    for join_request in query.all():
        if join_request.expires_at is None:
            join_request.expires_at = _join_request_expiration()
            changed = True
            continue
        if _as_aware_utc(join_request.expires_at) <= now:
            join_request.status = "expired"
            changed = True

    if changed:
        db.commit()


def create_family(db: Session, payload: FamilyCreate, creator_id: str) -> Family:
    family = Family(
        name=payload.name.strip(),
        invite_code=_unique_invite_code(db),
        created_by_id=creator_id,
    )
    db.add(family)
    db.flush()

    db.add(
        FamilyMember(
            family_id=family.id,
            user_id=creator_id,
            role=FamilyRole.OWNER.value,
            points=0,
        )
    )
    creator = db.get(User, creator_id)
    if creator:
        creator.active_family_id = family.id
        db.add(creator)
    db.commit()
    db.refresh(family)
    ensure_default_categories(db, family.id)
    return family


def join_family(db: Session, invite_code: str, user_id: str) -> Family:
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Entrada direta por codigo foi desativada. Envie uma solicitacao para aprovacao de um administrador.",
    )


def request_join_family(db: Session, invite_code: str, user_id: str) -> FamilyJoinRequest:
    family = db.query(Family).filter(Family.invite_code == invite_code.strip().upper()).first()
    if not family:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Codigo de convite invalido.")

    _refresh_expired_join_requests(db, family_id=family.id, requester_id=user_id)

    existing_member = (
        db.query(FamilyMember)
        .filter(FamilyMember.family_id == family.id, FamilyMember.user_id == user_id)
        .first()
    )
    if existing_member:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Voce ja faz parte desta familia.")

    pending_request = (
        db.query(FamilyJoinRequest)
        .filter(
            FamilyJoinRequest.family_id == family.id,
            FamilyJoinRequest.requester_id == user_id,
            FamilyJoinRequest.status == "pending",
        )
        .first()
    )
    if pending_request:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Voce ja tem uma solicitacao pendente para esta familia.")

    join_request = FamilyJoinRequest(
        family_id=family.id,
        requester_id=user_id,
        status="pending",
        expires_at=_join_request_expiration(),
    )
    db.add(join_request)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nao foi possivel criar a solicitacao. Tente novamente em instantes.",
        ) from exc
    db.refresh(join_request)
    return (
        db.query(FamilyJoinRequest)
        .options(selectinload(FamilyJoinRequest.family), selectinload(FamilyJoinRequest.requester))
        .filter(FamilyJoinRequest.id == join_request.id)
        .one()
    )


def list_user_families(db: Session, user_id: str) -> list[Family]:
    return (
        db.query(Family)
        .join(FamilyMember, FamilyMember.family_id == Family.id)
        .filter(FamilyMember.user_id == user_id)
        .order_by(Family.created_at.asc())
        .all()
    )


def get_primary_family(db: Session, user_id: str) -> Family | None:
    return (
        db.query(Family)
        .join(FamilyMember, FamilyMember.family_id == Family.id)
        .filter(FamilyMember.user_id == user_id)
        .order_by(FamilyMember.created_at.asc())
        .first()
    )


def _user_is_family_member(db: Session, family_id: str | None, user_id: str) -> bool:
    if not family_id:
        return False
    return (
        db.query(FamilyMember.id)
        .join(Family, Family.id == FamilyMember.family_id)
        .filter(FamilyMember.family_id == family_id, FamilyMember.user_id == user_id)
        .first()
        is not None
    )


def get_active_family(db: Session, user: User) -> Family | None:
    if user.active_family_id and _user_is_family_member(db, user.active_family_id, user.id):
        family = db.query(Family).filter(Family.id == user.active_family_id).first()
        if family:
            return family

    fallback = get_primary_family(db, user.id)
    next_family_id = fallback.id if fallback else None
    if user.active_family_id != next_family_id:
        user.active_family_id = next_family_id
        db.add(user)
        db.commit()
        db.refresh(user)
    return fallback


def set_active_family(db: Session, user: User, family_id: str) -> Family:
    require_family_member(db, family_id, user.id)
    family = get_family(db, family_id)
    user.active_family_id = family.id
    db.add(user)
    db.commit()
    db.refresh(user)
    return family


def refresh_user_active_family(db: Session, user_id: str) -> Family | None:
    user = db.get(User, user_id)
    if not user:
        return None
    return get_active_family(db, user)


def get_family(db: Session, family_id: str) -> Family:
    family = db.query(Family).filter(Family.id == family_id).first()
    if not family:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Familia nao encontrada.")
    return family


def require_family_member(db: Session, family_id: str, user_id: str) -> FamilyMember:
    member = (
        db.query(FamilyMember)
        .filter(FamilyMember.family_id == family_id, FamilyMember.user_id == user_id)
        .first()
    )
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Voce nao faz parte desta familia.",
        )
    return member


def require_family_admin(db: Session, family_id: str, user_id: str) -> FamilyMember:
    member = require_family_member(db, family_id, user_id)
    if member.role not in [FamilyRole.OWNER.value, FamilyRole.ADMIN.value]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Somente administradores podem alterar esta familia.",
        )
    return member


def list_members(db: Session, family_id: str) -> list[FamilyMember]:
    return (
        db.query(FamilyMember)
        .options(selectinload(FamilyMember.user))
        .filter(FamilyMember.family_id == family_id)
        .order_by(FamilyMember.points.desc(), FamilyMember.created_at.asc())
        .all()
    )


def list_pending_join_requests(db: Session, family_id: str, user_id: str) -> list[FamilyJoinRequest]:
    require_family_admin(db, family_id, user_id)
    _refresh_expired_join_requests(db, family_id=family_id)
    return (
        db.query(FamilyJoinRequest)
        .options(selectinload(FamilyJoinRequest.family), selectinload(FamilyJoinRequest.requester))
        .filter(FamilyJoinRequest.family_id == family_id, FamilyJoinRequest.status == "pending")
        .order_by(FamilyJoinRequest.created_at.asc())
        .all()
    )


def decide_join_request(db: Session, family_id: str, user_id: str, request_id: str, approve: bool) -> FamilyJoinRequest:
    require_family_admin(db, family_id, user_id)
    _refresh_expired_join_requests(db, family_id=family_id)
    join_request = (
        db.query(FamilyJoinRequest)
        .options(selectinload(FamilyJoinRequest.family), selectinload(FamilyJoinRequest.requester))
        .filter(FamilyJoinRequest.family_id == family_id, FamilyJoinRequest.id == request_id)
        .with_for_update()
        .first()
    )
    if not join_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitacao nao encontrada.")
    if join_request.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Esta solicitacao ja foi respondida.")
    if join_request.expires_at and _as_aware_utc(join_request.expires_at) <= datetime.now(timezone.utc):
        join_request.status = "expired"
        join_request.decided_by_id = user_id
        db.add(join_request)
        db.commit()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Esta solicitacao expirou.")

    existing_member = (
        db.query(FamilyMember)
        .filter(FamilyMember.family_id == family_id, FamilyMember.user_id == join_request.requester_id)
        .first()
    )
    requester = db.get(User, join_request.requester_id) if approve else None
    requester_fallback_family = get_primary_family(db, requester.id) if requester else None
    if approve and not existing_member:
        db.add(FamilyMember(family_id=family_id, user_id=join_request.requester_id, role=FamilyRole.MEMBER.value))
        if requester and not _user_is_family_member(db, requester.active_family_id, requester.id):
            requester.active_family_id = requester_fallback_family.id if requester_fallback_family else family_id
            db.add(requester)

    join_request.status = "approved" if approve else "rejected"
    join_request.decided_by_id = user_id
    db.add(join_request)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Esta solicitacao ja foi processada.") from exc
    db.refresh(join_request)
    return join_request


def update_family(db: Session, family_id: str, user_id: str, payload: FamilyUpdate) -> Family:
    require_family_admin(db, family_id, user_id)
    family = get_family(db, family_id)

    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"]:
        family.name = data["name"].strip()
    if "description" in data:
        family.description = data["description"]
    if "image_url" in data:
        family.image_url = data["image_url"] or None

    db.add(family)
    db.commit()
    db.refresh(family)
    return family


def regenerate_invite_code(db: Session, family_id: str, user_id: str) -> Family:
    require_family_admin(db, family_id, user_id)
    family = db.query(Family).filter(Family.id == family_id).first()
    if not family:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Familia nao encontrada.")
    family.invite_code = _unique_invite_code(db)
    db.add(family)
    db.commit()
    db.refresh(family)
    return family


def update_member_role(db: Session, family_id: str, user_id: str, member_id: str, role: str) -> FamilyMember:
    actor = require_family_admin(db, family_id, user_id)
    member = (
        db.query(FamilyMember)
        .options(selectinload(FamilyMember.user))
        .filter(FamilyMember.family_id == family_id, FamilyMember.id == member_id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membro nao encontrado.")
    if member.role == FamilyRole.OWNER.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="O criador da familia nao pode ser rebaixado.")
    if actor.id == member.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Voce nao pode alterar a propria permissao.")
    if actor.role != FamilyRole.OWNER.value and (member.role == FamilyRole.ADMIN.value or role == "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Somente o proprietario pode promover ou rebaixar administradores.",
        )
    if member.role == FamilyRole.ADMIN.value and role == "member":
        admin_count = (
            db.query(FamilyMember)
            .filter(FamilyMember.family_id == family_id, FamilyMember.role.in_([FamilyRole.OWNER.value, FamilyRole.ADMIN.value]))
            .count()
        )
        if admin_count <= 1:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A familia precisa manter pelo menos um administrador.")

    member.role = FamilyRole.ADMIN.value if role == "admin" else FamilyRole.MEMBER.value
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def remove_member(db: Session, family_id: str, user_id: str, member_id: str) -> None:
    actor = require_family_admin(db, family_id, user_id)
    member = (
        db.query(FamilyMember)
        .filter(FamilyMember.family_id == family_id, FamilyMember.id == member_id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membro nao encontrado.")
    if member.role == FamilyRole.OWNER.value or actor.id == member.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Esta acao nao esta disponivel para este membro.")
    if member.role == FamilyRole.ADMIN.value and actor.role != FamilyRole.OWNER.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Somente o proprietario pode remover administradores.")
    removed_user_id = member.user_id
    db.delete(member)
    db.commit()
    refresh_user_active_family(db, removed_user_id)


def leave_family(db: Session, family_id: str, user_id: str) -> None:
    member = require_family_member(db, family_id, user_id)
    members = db.query(FamilyMember).filter(FamilyMember.family_id == family_id).all()
    admins = [item for item in members if item.role in [FamilyRole.OWNER.value, FamilyRole.ADMIN.value]]

    if len(members) == 1:
        family = get_family(db, family_id)
        db.delete(family)
        db.commit()
        refresh_user_active_family(db, user_id)
        return

    if member.role in [FamilyRole.OWNER.value, FamilyRole.ADMIN.value] and len(admins) <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Antes de sair, promova outro membro a administrador para a familia nao ficar sem administracao.",
        )

    task_ids = [task_id for (task_id,) in db.query(Task.id).filter(Task.family_id == family_id).all()]
    if task_ids:
        db.query(TaskAssignee).filter(TaskAssignee.task_id.in_(task_ids), TaskAssignee.user_id == user_id).delete(synchronize_session=False)
    db.query(Task).filter(Task.family_id == family_id, Task.assignee_id == user_id).update({Task.assignee_id: None}, synchronize_session=False)

    family = get_family(db, family_id)
    if family.created_by_id == user_id:
        family.created_by_id = None
        db.add(family)

    db.delete(member)
    db.commit()
    refresh_user_active_family(db, user_id)


def delete_family(db: Session, family_id: str, user_id: str) -> None:
    actor = require_family_admin(db, family_id, user_id)
    if actor.role != FamilyRole.OWNER.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Somente o proprietario pode excluir a familia.")
    family = db.query(Family).filter(Family.id == family_id).first()
    if not family:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Familia nao encontrada.")
    affected_user_ids = [member.user_id for member in db.query(FamilyMember).filter(FamilyMember.family_id == family_id).all()]
    db.delete(family)
    db.commit()
    for affected_user_id in affected_user_ids:
        refresh_user_active_family(db, affected_user_id)
