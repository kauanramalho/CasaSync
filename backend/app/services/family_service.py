import secrets
import string

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.models.enums import FamilyRole
from app.models.family import Family, FamilyMember
from app.schemas.family import FamilyCreate
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


def list_members(db: Session, family_id: str) -> list[FamilyMember]:
    return (
        db.query(FamilyMember)
        .options(selectinload(FamilyMember.user))
        .filter(FamilyMember.family_id == family_id)
        .order_by(FamilyMember.points.desc(), FamilyMember.created_at.asc())
        .all()
    )

