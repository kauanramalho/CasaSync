import secrets
from typing import NoReturn

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password, password_needs_rehash, verify_password
from app.models.family import FamilyMember
from app.models.user import User
from app.schemas.user import PasswordUpdate, UserCreate, UserUpdate
from app.services.username_service import looks_like_email, normalize_username, unique_username_from_email


DUMMY_PASSWORD_HASH = hash_password("CasaSyncDummyPassword1")
USER_UNIQUE_CONSTRAINTS = {
    "ix_users_email",
    "ix_users_username",
    "ix_users_username_lower_unique",
    "ix_users_username_unique",
}


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(func.lower(User.email) == email.strip().lower()).first()


def get_user_by_username(db: Session, username: str) -> User | None:
    return db.query(User).filter(func.lower(User.username) == username.strip().lower()).first()


def _existing_usernames(db: Session) -> set[str]:
    return {
        username.strip().lower()
        for (username,) in db.query(User.username).filter(User.username.isnot(None)).all()
        if username and username.strip()
    }


def is_user_unique_violation(exc: IntegrityError) -> bool:
    original = exc.orig
    sqlstate = getattr(original, "sqlstate", None) or getattr(original, "pgcode", None)
    diagnostic = getattr(original, "diag", None)
    constraint_name = getattr(diagnostic, "constraint_name", None)
    if sqlstate == "23505":
        return constraint_name in USER_UNIQUE_CONSTRAINTS

    message = str(original).lower()
    return "unique constraint failed" in message and (
        "users.email" in message or "users.username" in message
    )


def _raise_user_integrity_error(db: Session, exc: IntegrityError) -> NoReturn:
    db.rollback()
    if is_user_unique_violation(exc):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="E-mail ou username ja esta em uso.",
        ) from exc
    raise exc


def register_user(db: Session, payload: UserCreate, *, commit: bool = True) -> User:
    existing_user = get_user_by_email(db, payload.email)
    if existing_user:
        requested_username = payload.username or existing_user.username
        can_resume = (
            existing_user.is_active
            and not existing_user.email_verified
            and bool(existing_user.username)
            and bool(requested_username)
            and existing_user.username.casefold() == requested_username.casefold()
            and verify_password(payload.password, existing_user.hashed_password)
        )
        if not can_resume:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="E-mail ou username ja esta em uso.",
            )
        user = existing_user
        user.name = payload.name.strip()
        if password_needs_rehash(user.hashed_password):
            user.hashed_password = hash_password(payload.password)
    else:
        username = payload.username or unique_username_from_email(payload.email, _existing_usernames(db))
        existing_username = get_user_by_username(db, username)
        if existing_username:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="E-mail ou username ja esta em uso.",
            )

        user = User(
            name=payload.name.strip(),
            username=username,
            email=payload.email.strip().lower(),
            hashed_password=hash_password(payload.password),
            email_verified=False,
            two_factor_enabled=True,
        )
    db.add(user)
    try:
        db.flush()
        if commit:
            db.commit()
    except IntegrityError as exc:
        _raise_user_integrity_error(db, exc)
    except Exception:
        db.rollback()
        raise
    if commit:
        db.refresh(user)
    return user


def update_user_profile(db: Session, user: User, payload: UserUpdate, *, commit: bool = True) -> User:
    data = payload.model_dump(exclude_unset=True)
    current_password = data.pop("current_password", None)

    if "email" in data and data["email"]:
        next_email = data["email"].strip().lower()
        existing_email = get_user_by_email(db, next_email)
        if existing_email and existing_email.id != user.id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="E-mail ou username ja esta em uso.")
        if next_email != user.email:
            if not current_password or not verify_password(current_password, user.hashed_password):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Confirme sua senha atual para alterar o e-mail.",
                )
            user.email = next_email
            user.email_verified = False
            user.email_verified_at = None
            user.last_2fa_verified_at = None
            user.token_version += 1

    if "username" in data:
        next_username = normalize_username(data["username"], required=False)
        if next_username:
            existing_username = get_user_by_username(db, next_username)
            if existing_username and existing_username.id != user.id:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="E-mail ou username ja esta em uso.")
        user.username = next_username

    if "name" in data and data["name"]:
        user.name = data["name"].strip()
    if "avatar_url" in data:
        user.avatar_url = data["avatar_url"] or None

    db.add(user)
    try:
        db.flush()
        if commit:
            db.commit()
    except IntegrityError as exc:
        _raise_user_integrity_error(db, exc)
    except Exception:
        db.rollback()
        raise
    if commit:
        db.refresh(user)
    return user


def change_user_password(db: Session, user: User, payload: PasswordUpdate) -> None:
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Senha atual invalida.")
    if verify_password(payload.new_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A nova senha deve ser diferente da senha atual.")
    user.hashed_password = hash_password(payload.new_password)
    user.token_version += 1
    db.add(user)
    db.commit()


def authenticate_user(db: Session, identifier: str, password: str) -> User:
    normalized_identifier = identifier.strip().lower()
    if looks_like_email(normalized_identifier):
        user = get_user_by_email(db, normalized_identifier)
    else:
        try:
            normalized_username = normalize_username(normalized_identifier, required=True)
        except ValueError:
            normalized_username = None
        user = get_user_by_username(db, normalized_username) if normalized_username else None

    if not user:
        verify_password(password, DUMMY_PASSWORD_HASH)
    if not user or not user.is_active or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail/username ou senha invalidos.",
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


def delete_user_account(db: Session, user: User, current_password: str) -> None:
    from app.services.family_service import leave_family

    if not verify_password(current_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Senha atual invalida.")

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
