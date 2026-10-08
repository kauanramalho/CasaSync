"""Email-proven password recovery; reset codes cannot authorize a login."""
import hmac
import logging
import secrets
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_password
from app.models.two_factor import TwoFactorCode
from app.models.user import User
from app.schemas.user import PasswordResetConfirm
from app.services.email_service import send_two_factor_email, two_factor_delivery_available
from app.services.two_factor_service import (
    _enforce_send_limits, _generate_code, _hash_code, _invalidate_active_codes,
    as_aware_utc, utc_now,
)

PURPOSE = "password_reset"
REQUEST_MESSAGE = "Se houver uma conta ativa com esse e-mail, enviaremos um codigo para recuperar sua senha."
INVALID_MESSAGE = "Codigo invalido ou expirado. Solicite um novo codigo se necessario."
logger = logging.getLogger(__name__)


def require_password_reset_available() -> None:
    if not get_settings().password_reset_enabled or not two_factor_delivery_available():
        raise HTTPException(503, "Recuperacao de senha temporariamente indisponivel. Tente novamente mais tarde.")


def request_password_reset(db: Session, email: str) -> None:
    require_password_reset_available()
    user = db.query(User).filter(func.lower(User.email) == email, User.is_active.is_(True)).with_for_update().first()
    if not user:
        return
    try:
        # Serialize sends for the account and keep cooldown responses identical
        # to unknown emails. An unauthenticated request reveals no account IDs.
        _enforce_send_limits(db, user.id, PURPOSE)
    except HTTPException:
        db.rollback()
        return
    settings = get_settings()
    _invalidate_active_codes(db, user.id, PURPOSE)
    code = _generate_code()
    salt = secrets.token_urlsafe(16)
    now = utc_now()
    db.add(TwoFactorCode(
        user_id=user.id, purpose=PURPOSE,
        code_hash=_hash_code(user.id, PURPOSE, salt, code), salt=salt,
        expires_at=now + timedelta(minutes=settings.two_factor_code_ttl_minutes),
        max_attempts=settings.two_factor_max_attempts, last_sent_at=now,
    ))
    try:
        db.flush()
        send_two_factor_email(user.email, code, PURPOSE, settings.two_factor_code_ttl_minutes)
        db.commit()
    except HTTPException:
        db.rollback()
        # Delivery failures must not reveal that an email belongs to a user.
        logger.warning("Password recovery delivery unavailable.")
    except Exception:
        db.rollback()
        raise


def confirm_password_reset(db: Session, payload: PasswordResetConfirm) -> None:
    require_password_reset_available()
    user = db.query(User).filter(func.lower(User.email) == payload.email, User.is_active.is_(True)).with_for_update().first()
    if not user:
        raise HTTPException(400, INVALID_MESSAGE)
    challenge = db.query(TwoFactorCode).filter(
        TwoFactorCode.user_id == user.id, TwoFactorCode.purpose == PURPOSE,
        TwoFactorCode.consumed_at.is_(None),
    ).order_by(TwoFactorCode.created_at.desc()).with_for_update().first()
    now = utc_now()
    if not challenge or as_aware_utc(challenge.expires_at) <= now or challenge.attempts >= challenge.max_attempts:
        raise HTTPException(400, INVALID_MESSAGE)
    expected = _hash_code(user.id, PURPOSE, challenge.salt, payload.code)
    if not hmac.compare_digest(expected, challenge.code_hash):
        challenge.attempts += 1
        db.commit()
        raise HTTPException(400, INVALID_MESSAGE)

    user.hashed_password = hash_password(payload.new_password)
    user.token_version += 1
    user.email_verified = True
    if not user.email_verified_at:
        user.email_verified_at = now
    # Consume recovery and pending login/signup codes in the same transaction.
    db.query(TwoFactorCode).filter(
        TwoFactorCode.user_id == user.id, TwoFactorCode.consumed_at.is_(None),
    ).update({TwoFactorCode.consumed_at: now}, synchronize_session=False)
    db.commit()
