import secrets
import string

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.models.enums import FamilyRole
from app.models.family import Family, FamilyJoinRequest, FamilyMember
from app.models.task import Task, TaskAssignee
from app.schemas.family import FamilyCreate, FamilyUpdate
from app.services.category_service import ensure_default_categories


def _generate_invite_code(length: int = 8) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _unique_invite_code(db: Session) -> str:
    for _ in range(10):
        code = _generate_invite_code()
        if not db.query(Family).filter(Family.invite_code == code).first():
            return code
    raise RuntimeError("Não foi possível gerar um código de convite único.")


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
    db.commit()
    db.refresh(family)
    ensure_default_categories(db, family.id)
    return family


def join_family(db: Session, invite_code: str, user_id: str) -> Family:
    family = db.query(Family).filter(Family.invite_code == invite_code.strip().upper()).first()
    if not family:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Código de convite inválido.")

    existing_member = (
        db.query(FamilyMember)
        .filter(FamilyMember.family_id == family.id, FamilyMember.user_id == user_id)
        .first()
    )
    if existing_member:
        return family

    db.add(FamilyMember(family_id=family.id, user_id=user_id, role=FamilyRole.MEMBER.value))
    db.commit()
    db.refresh(family)
    return family


def request_join_family(db: Session, invite_code: str, user_id: str) -> FamilyJoinRequest:
    family = db.query(Family).filter(Family.invite_code == invite_code.strip().upper()).first()
    if not family:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Codigo de convite invalido.")

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

    join_request = FamilyJoinRequest(family_id=family.id, requester_id=user_id, status="pending")
    db.add(join_request)
    db.commit()
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
            detail="Você não faz parte desta família.",
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
    return (
        db.query(FamilyJoinRequest)
        .options(selectinload(FamilyJoinRequest.family), selectinload(FamilyJoinRequest.requester))
        .filter(FamilyJoinRequest.family_id == family_id, FamilyJoinRequest.status == "pending")
        .order_by(FamilyJoinRequest.created_at.asc())
        .all()
    )


def decide_join_request(db: Session, family_id: str, user_id: str, request_id: str, approve: bool) -> FamilyJoinRequest:
    require_family_admin(db, family_id, user_id)
    join_request = (
        db.query(FamilyJoinRequest)
        .options(selectinload(FamilyJoinRequest.family), selectinload(FamilyJoinRequest.requester))
        .filter(FamilyJoinRequest.family_id == family_id, FamilyJoinRequest.id == request_id)
        .first()
    )
    if not join_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitacao nao encontrada.")
    if join_request.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Esta solicitacao ja foi respondida.")

    existing_member = (
        db.query(FamilyMember)
        .filter(FamilyMember.family_id == family_id, FamilyMember.user_id == join_request.requester_id)
        .first()
    )
    if approve and not existing_member:
        db.add(FamilyMember(family_id=family_id, user_id=join_request.requester_id, role=FamilyRole.MEMBER.value))

    join_request.status = "approved" if approve else "rejected"
    join_request.decided_by_id = user_id
    db.add(join_request)
    db.commit()
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
    if member.role == FamilyRole.OWNER.value and actor.id != member.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="O criador da familia nao pode ser rebaixado por outro admin.")

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
    db.delete(member)
    db.commit()


def leave_family(db: Session, family_id: str, user_id: str) -> None:
    member = require_family_member(db, family_id, user_id)
    members = db.query(FamilyMember).filter(FamilyMember.family_id == family_id).all()
    admins = [item for item in members if item.role in [FamilyRole.OWNER.value, FamilyRole.ADMIN.value]]

    if len(members) == 1:
        family = get_family(db, family_id)
        db.delete(family)
        db.commit()
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


def delete_family(db: Session, family_id: str, user_id: str) -> None:
    require_family_admin(db, family_id, user_id)
    family = db.query(Family).filter(Family.id == family_id).first()
    if not family:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Familia nao encontrada.")
    db.delete(family)
    db.commit()
