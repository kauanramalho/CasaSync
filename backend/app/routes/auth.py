import hashlib
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.rate_limit import check_rate_limit, client_identifier
from app.core.deps import get_current_user
from app.core.security import create_access_token, create_pending_two_factor_token
from app.database.session import get_db
from app.models.user import User
from app.schemas.token import AuthResponse, TwoFactorRequiredResponse, TwoFactorResendRequest, TwoFactorVerifyRequest
from app.schemas.user import PasswordUpdate, UserCreate, UserLogin, UserRead, UserUpdate
from app.services.auth_service import (
    authenticate_user,
    change_user_password,
    delete_user_account,
    logout_user,
    register_user,
    update_user_profile,
)
from app.services.family_service import get_active_family
from app.services.two_factor_service import (
    create_two_factor_challenge,
    load_pending_two_factor_context,
    login_two_factor_purpose,
    mask_email,
    record_login_without_two_factor,
    should_require_login_two_factor,
    verify_two_factor_code,
)


router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


def _identifier_fingerprint(identifier: str | None) -> str:
    normalized_identifier = (identifier or "").strip().lower()
    if not normalized_identifier:
        return "missing"
    return hashlib.sha256(normalized_identifier.encode("utf-8")).hexdigest()[:12]


def _two_factor_response(user: User, purpose: str, db: Session) -> TwoFactorRequiredResponse:
    challenge = create_two_factor_challenge(db, user, purpose)
    return TwoFactorRequiredResponse(
        pending_token=create_pending_two_factor_token(
            user.id,
            challenge.id,
            purpose,
            token_version=user.token_version,
        ),
        purpose=purpose,
        masked_email=mask_email(user.email),
        expires_at=challenge.expires_at,
    )


@router.post("/register", response_model=AuthResponse | TwoFactorRequiredResponse, status_code=201)
def register(payload: UserCreate, request: Request, db: Session = Depends(get_db)):
    try:
        check_rate_limit(f"auth:register:{client_identifier(request)}", limit=8, window_seconds=3600)
        user = register_user(db, payload)
        return _two_factor_response(user, "signup", db)
    except HTTPException as exc:
        logger.warning(
            "Register request failed status=%s email_hash=%s detail=%s",
            exc.status_code,
            _identifier_fingerprint(payload.email),
            exc.detail,
        )
        raise
    except Exception as exc:
        logger.exception("Unexpected register error email_hash=%s", _identifier_fingerprint(payload.email))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Nao foi possivel criar sua conta agora. Tente novamente em alguns minutos.",
        ) from exc


@router.post("/login", response_model=AuthResponse | TwoFactorRequiredResponse)
def login(payload: UserLogin, request: Request, db: Session = Depends(get_db)):
    client_id = client_identifier(request)
    identifier_hash = _identifier_fingerprint(payload.identifier)
    check_rate_limit(f"auth:login:ip:{client_id}", limit=30, window_seconds=300)
    check_rate_limit(f"auth:login:account:{client_id}:{identifier_hash}", limit=10, window_seconds=300)
    user = authenticate_user(db, payload.identifier, payload.password)
    purpose = login_two_factor_purpose(user)
    if purpose == "signup" or should_require_login_two_factor(user):
        return _two_factor_response(user, purpose, db)
    user = record_login_without_two_factor(db, user)
    get_active_family(db, user)
    return AuthResponse(access_token=create_access_token(user.id, token_version=user.token_version), user=user)


@router.post("/2fa/verify", response_model=AuthResponse)
def verify_two_factor(payload: TwoFactorVerifyRequest, request: Request, db: Session = Depends(get_db)):
    check_rate_limit(f"auth:2fa:verify:{client_identifier(request)}", limit=20, window_seconds=300)
    context = load_pending_two_factor_context(db, payload.pending_token)
    user = verify_two_factor_code(db, context, payload.code)
    get_active_family(db, user)
    return AuthResponse(access_token=create_access_token(user.id, token_version=user.token_version), user=user)


@router.post("/2fa/resend", response_model=TwoFactorRequiredResponse)
def resend_two_factor(payload: TwoFactorResendRequest, request: Request, db: Session = Depends(get_db)):
    check_rate_limit(f"auth:2fa:resend:{client_identifier(request)}", limit=10, window_seconds=300)
    context = load_pending_two_factor_context(db, payload.pending_token)
    return _two_factor_response(context.user, context.purpose, db)


@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_active_family(db, current_user)
    return current_user


@router.patch("/me", response_model=UserRead | TwoFactorRequiredResponse)
def update_me(payload: UserUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    next_email = payload.email.strip().lower() if payload.email else None
    email_changed = bool(next_email and next_email != current_user.email)
    user = update_user_profile(db, current_user, payload)
    if email_changed:
        return _two_factor_response(user, "signup", db)
    return user


@router.post("/me/password", status_code=204)
def update_password(payload: PasswordUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    change_user_password(db, current_user, payload)
    return None


@router.post("/logout", status_code=204)
def logout(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    logout_user(db, current_user)
    return None


@router.delete("/me", status_code=204)
def delete_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    delete_user_account(db, current_user)
    return None
