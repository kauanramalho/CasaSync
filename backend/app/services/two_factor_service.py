import hmac
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from hashlib import sha256

from fastapi import HTTPException, status
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import decode_token
from app.models.two_factor import TwoFactorCode
from app.models.user import User
from app.services.email_service import send_two_factor_email


PURPOSE_SIGNUP = "signup"
PURPOSE_LOGIN = "login"
VALID_PURPOSES = {PURPOSE_SIGNUP, PURPOSE_LOGIN}


@dataclass(frozen=True)
class PendingTwoFactorContext:
    user: User
    challenge_id: str
    purpose: str


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    if not domain:
        return "***"
    visible = local[:1] if local else "*"
    return f"{visible}{'*' * max(2, len(local) - 1)}@{domain}"


def should_require_login_two_factor(user: User) -> bool:
    if not user.two_factor_enabled:
        return False
    if not user.last_2fa_verified_at:
        return True

    settings = get_settings()
    verified_at = as_aware_utc(user.last_2fa_verified_at)
    return verified_at <= utc_now() - timedelta(days=settings.two_factor_login_interval_days)


def login_two_factor_purpose(user: User) -> str:
    return PURPOSE_SIGNUP if not user.email_verified else PURPOSE_LOGIN


def _generate_code() -> str:
    settings = get_settings()
    upper_bound = 10 ** settings.two_factor_code_length
    return str(secrets.randbelow(upper_bound)).zfill(settings.two_factor_code_length)


def _code_secret() -> bytes:
    settings = get_settings()
    secret = settings.two_factor_hmac_secret or settings.jwt_secret_key
    return secret.encode("utf-8")


def _hash_code(user_id: str, purpose: str, salt: str, code: str) -> str:
    message = f"{user_id}:{purpose}:{salt}:{code}".encode("utf-8")
    return hmac.new(_code_secret(), message, sha256).hexdigest()


def _invalidate_active_codes(db: Session, user_id: str, purpose: str) -> None:
    now = utc_now()
    (
        db.query(TwoFactorCode)
        .filter(
            TwoFactorCode.user_id == user_id,
            TwoFactorCode.purpose == purpose,
            TwoFactorCode.consumed_at.is_(None),
        )
        .update({TwoFactorCode.consumed_at: now}, synchronize_session=False)
    )


def _enforce_send_limits(db: Session, user_id: str, purpose: str) -> None:
    settings = get_settings()
    now = utc_now()
    cooldown_start = now - timedelta(seconds=settings.two_factor_resend_cooldown_seconds)
    recent_code = (
        db.query(TwoFactorCode)
        .filter(
            TwoFactorCode.user_id == user_id,
            TwoFactorCode.purpose == purpose,
            TwoFactorCode.last_sent_at >= cooldown_start,
        )
        .first()
    )
    if recent_code:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Aguarde antes de solicitar outro codigo.",
        )

    hour_start = now - timedelta(hours=1)
    sends_last_hour = (
        db.query(TwoFactorCode)
        .filter(
            TwoFactorCode.user_id == user_id,
            TwoFactorCode.purpose == purpose,
            TwoFactorCode.created_at >= hour_start,
        )
        .count()
    )
    if sends_last_hour >= settings.two_factor_max_sends_per_hour:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Limite de envio de codigos atingido. Tente novamente mais tarde.",
        )


def create_two_factor_challenge(db: Session, user: User, purpose: str) -> TwoFactorCode:
    if purpose not in VALID_PURPOSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tipo de verificacao invalido.")

    settings = get_settings()
    _enforce_send_limits(db, user.id, purpose)
    _invalidate_active_codes(db, user.id, purpose)

    code = _generate_code()
    salt = secrets.token_urlsafe(16)
    now = utc_now()
    challenge = TwoFactorCode(
        user_id=user.id,
        purpose=purpose,
        code_hash=_hash_code(user.id, purpose, salt, code),
        salt=salt,
        expires_at=now + timedelta(minutes=settings.two_factor_code_ttl_minutes),
        max_attempts=settings.two_factor_max_attempts,
        last_sent_at=now,
    )
    db.add(challenge)
    db.commit()
    db.refresh(challenge)

    try:
        send_two_factor_email(user.email, code, purpose, settings.two_factor_code_ttl_minutes)
    except Exception:
        challenge.consumed_at = utc_now()
        db.add(challenge)
        db.commit()
        raise

    return challenge


def load_pending_two_factor_context(
    db: Session,
    pending_token: str,
    *,
    require_active_challenge: bool = False,
) -> PendingTwoFactorContext:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Verificacao expirada. Entre novamente.",
    )
    try:
        payload = decode_token(pending_token)
    except JWTError as exc:
        raise credentials_error from exc

    if payload.get("typ") != "2fa":
        raise credentials_error

    user_id = payload.get("sub")
    challenge_id = payload.get("challenge_id")
    purpose = payload.get("purpose")
    token_version = payload.get("ver", 0)
    if not user_id or not challenge_id or purpose not in VALID_PURPOSES:
        raise credentials_error

    user = db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()
    if not user or user.token_version != token_version:
        raise credentials_error

    if require_active_challenge:
        challenge_exists = (
            db.query(TwoFactorCode.id)
            .filter(
                TwoFactorCode.id == challenge_id,
                TwoFactorCode.user_id == user_id,
                TwoFactorCode.purpose == purpose,
                TwoFactorCode.consumed_at.is_(None),
            )
            .first()
        )
        if not challenge_exists:
            raise credentials_error

    return PendingTwoFactorContext(user=user, challenge_id=challenge_id, purpose=purpose)


def verify_two_factor_code(db: Session, context: PendingTwoFactorContext, code: str) -> User:
    normalized_code = code.strip()
    settings = get_settings()
    if not normalized_code.isdigit() or len(normalized_code) != settings.two_factor_code_length:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Codigo invalido.")

    challenge = (
        db.query(TwoFactorCode)
        .filter(
            TwoFactorCode.id == context.challenge_id,
            TwoFactorCode.user_id == context.user.id,
            TwoFactorCode.purpose == context.purpose,
            TwoFactorCode.consumed_at.is_(None),
        )
        .with_for_update()
        .first()
    )
    if not challenge:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Codigo invalido ou expirado.")

    now = utc_now()
    if as_aware_utc(challenge.expires_at) <= now:
        challenge.consumed_at = now
        db.add(challenge)
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Codigo expirado. Solicite um novo.")

    if challenge.attempts >= challenge.max_attempts:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Limite de tentativas atingido.")

    expected_hash = _hash_code(context.user.id, context.purpose, challenge.salt, normalized_code)
    if not hmac.compare_digest(expected_hash, challenge.code_hash):
        challenge.attempts += 1
        db.add(challenge)
        db.commit()
        if challenge.attempts >= challenge.max_attempts:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Limite de tentativas atingido.")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Codigo invalido.")

    context.user.email_verified = True
    if not context.user.email_verified_at:
        context.user.email_verified_at = now
    context.user.last_2fa_verified_at = now
    context.user.last_login_at = now
    challenge.consumed_at = now

    db.add(context.user)
    db.add(challenge)
    db.commit()
    db.refresh(context.user)
    return context.user


def record_login_without_two_factor(db: Session, user: User) -> User:
    user.last_login_at = utc_now()
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
