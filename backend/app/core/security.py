import base64
import hashlib
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import get_settings


PASSWORD_HASH_PREFIX = "$casasync-bcrypt-sha256$"


def _password_digest(password: str) -> bytes:
    password_bytes = password.encode("utf-8")
    return base64.b64encode(hashlib.sha256(password_bytes).digest())


def hash_password(password: str) -> str:
    password_hash = bcrypt.hashpw(_password_digest(password), bcrypt.gensalt()).decode("utf-8")
    return f"{PASSWORD_HASH_PREFIX}{password_hash}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        if hashed_password.startswith(PASSWORD_HASH_PREFIX):
            stored_hash = hashed_password.removeprefix(PASSWORD_HASH_PREFIX).encode("utf-8")
            return bcrypt.checkpw(_password_digest(plain_password), stored_hash)
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except ValueError:
        return False


def password_needs_rehash(hashed_password: str) -> bool:
    return not hashed_password.startswith(PASSWORD_HASH_PREFIX)


def create_access_token(
    subject: str,
    expires_delta: timedelta | None = None,
    token_version: int = 0,
    extra_claims: dict | None = None,
) -> str:
    settings = get_settings()
    issued_at = datetime.now(timezone.utc)
    expires_at = issued_at + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    payload = {"sub": str(subject), "iat": issued_at, "exp": expires_at, "ver": token_version, "typ": "access"}
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_pending_two_factor_token(
    subject: str,
    challenge_id: str,
    purpose: str,
    token_version: int = 0,
) -> str:
    settings = get_settings()
    return create_access_token(
        subject,
        expires_delta=timedelta(minutes=settings.two_factor_pending_token_expire_minutes),
        token_version=token_version,
        extra_claims={"typ": "2fa", "challenge_id": challenge_id, "purpose": purpose},
    )


def decode_token(token: str) -> dict:
    settings = get_settings()
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
