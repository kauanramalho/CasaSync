import secrets

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password, password_needs_rehash, verify_password
from app.models.family import FamilyMember
from app.models.user import User
from app.schemas.user import PasswordUpdate, UserCreate, UserUpdate


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email.strip().lower()).first()


def get_user_by_username(db: Session, username: str) -> User | None:
    return db.query(User).filter(User.username == username.strip().lower()).first()


def register_user(db: Session, payload: UserCreate) -> User:
    existing_user = get_user_by_email(db, payload.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ja existe uma conta com este e-mail.",
        )

    user = User(
        name=payload.name.strip(),
        email=payload.email.strip().lower(),
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ja existe uma conta com este e-mail.",
        ) from exc
    db.refresh(user)
    return user


def update_user_profile(db: Session, user: User, payload: UserUpdate) -> User:
    data = payload.model_dump(exclude_unset=True)

    if "email" in data and data["email"]:
        next_email = data["email"].lower()
        existing_email = get_user_by_email(db, next_email)
        if existing_email and existing_email.id != user.id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ja existe uma conta com este e-mail.")
        user.email = next_email

    if "username" in data:
        next_username = (data["username"] or "").strip().lower() or None
        if next_username:
            existing_username = get_user_by_username(db, next_username)
            if existing_username and existing_username.id != user.id:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este username ja esta em uso.")
        user.username = next_username

    if "name" in data and data["name"]:
        user.name = data["name"].strip()
    if "avatar_url" in data:
        user.avatar_url = data["avatar_url"] or None

    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="E-mail ou username ja esta em uso.") from exc
    db.refresh(user)
    return user


def change_user_password(db: Session, user: User, payload: PasswordUpdate) -> None:
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Senha atual invalida.")
    user.hashed_password = hash_password(payload.new_password)
    user.token_version += 1
    db.add(user)
    db.commit()


def authenticate_user(db: Session, email: str, password: str) -> User:
    user = get_user_by_email(db, email)
    if not user or not user.is_active or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha invalidos.",
        )
    if password_needs_rehash(user.hashed_password):
        user.hashed_password = hash_password(password)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def logout_user(db: Session, user: User) -> None:
    user.token_version += 1
    db.add(user)
    db.commit()


def delete_user_account(db: Session, user: User) -> None:
    from app.services.family_service import leave_family

    memberships = db.query(FamilyMember).filter(FamilyMember.user_id == user.id).all()
    for membership in memberships:
        leave_family(db, membership.family_id, user.id)

    user.is_active = False
    user.token_version += 1
    user.username = None
    user.email = f"deleted-{user.id}@casasync.invalid"
    user.name = "Conta excluida"
    user.avatar_url = None
    user.hashed_password = hash_password(secrets.token_urlsafe(32))
    db.add(user)
    db.commit()
