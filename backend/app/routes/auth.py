import hashlib
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import get_current_user
from app.core.rate_limit import check_rate_limit, client_identifier
from app.core.security import create_access_token, create_pending_two_factor_token
from app.database.session import get_db
from app.models.user import User
from app.schemas.token import AuthResponse, TwoFactorRequiredResponse, TwoFactorResendRequest, TwoFactorVerifyRequest
from app.schemas.user import PasswordConfirmation, PasswordUpdate, UserCreate, UserLogin, UserRead, UserUpdate
from app.services.auth_service import (
    authenticate_user,
    change_user_password,
    delete_user_account,
    logout_user,
    register_user,
    update_user_profile,
)
from app.services.email_service import two_factor_delivery_available
from app.services.family_service import get_active_family
from app.services.two_factor_service import (
    as_aware_utc,
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


def _two_factor_response(
    user: User,
    purpose: str,
    db: Session,
    *,
    commit: bool = True,
    enforce_cooldown: bool = True,
) -> TwoFactorRequiredResponse:
    challenge = create_two_factor_challenge(db, user, purpose, commit=commit, enforce_cooldown=enforce_cooldown)
    settings = get_settings()
    return TwoFactorRequiredResponse(
        pending_token=create_pending_two_factor_token(
            user.id,
            challenge.id,
            purpose,
            token_version=user.token_version,
        ),
        purpose=purpose,
        masked_email=mask_email(user.email),
        expires_at=as_aware_utc(challenge.expires_at),
        delivery_mode="development" if settings.email_dev_mode else "email",
    )


@router.post("/register", response_model=AuthResponse | TwoFactorRequiredResponse, status_code=201)
def register(payload: UserCreate, request: Request, db: Session = Depends(get_db)):
    try:
        check_rate_limit(f"auth:register:{client_identifier(request)}", limit=8, window_seconds=3600)
        user = register_user(db, payload, commit=False)
        if not two_factor_delivery_available():
            user = record_login_without_two_factor(db, user, commit=False)
            response = AuthResponse(
                access_token=create_access_token(user.id, token_version=user.token_version),
                user=user,
            )
            db.commit()
            return response
        response = _two_factor_response(user, "signup", db, commit=False, enforce_cooldown=False)
        db.commit()
        return response
    except HTTPException as exc:
        db.rollback()
        logger.warning(
            "Register request failed status=%s email_hash=%s detail=%s",
            exc.status_code,
            _identifier_fingerprint(payload.email),
            exc.detail,
        )
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("Unexpected register error email_hash=%s", _identifier_fingerprint(payload.email))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Nao foi possivel criar sua conta agora. Tente novamente em alguns minutos.",
        ) from exc


@router.post("/login", response_model=AuthResponse | TwoFactorRequiredResponse)
def login(payload: UserLogin, request: Request, db: Session = Depends(get_db)):
    client_id = client_identifier(request)
    identifier_hash = _identifier_fingerprint(payload.identifier)
    try:
        check_rate_limit(f"auth:login:ip:{client_id}", limit=30, window_seconds=300)
        check_rate_limit(f"auth:login:account:{identifier_hash}", limit=10, window_seconds=300)
        user = authenticate_user(db, payload.identifier, payload.password)
        purpose = login_two_factor_purpose(user)
        if two_factor_delivery_available() and (purpose == "signup" or should_require_login_two_factor(user)):
            return _two_factor_response(user, purpose, db, enforce_cooldown=False)
        if not user.email_verified:
            logger.warning(
                "Login concedido sem verificacao de e-mail (fallback sem canal de entrega) email_hash=%s",
                identifier_hash,
            )
        user = record_login_without_two_factor(db, user)
        get_active_family(db, user)
        return AuthResponse(access_token=create_access_token(user.id, token_version=user.token_version), user=user)
    except HTTPException as exc:
        db.rollback()
        if exc.status_code not in {status.HTTP_401_UNAUTHORIZED, status.HTTP_429_TOO_MANY_REQUESTS}:
            logger.warning(
                "Login request failed status=%s email_hash=%s detail=%s",
                exc.status_code,
                identifier_hash,
                exc.detail,
            )
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("Unexpected login error email_hash=%s", identifier_hash)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Nao foi possivel concluir o login agora. Tente novamente em alguns minutos.",
        ) from exc


@router.post("/2fa/verify", response_model=AuthResponse)
def verify_two_factor(payload: TwoFactorVerifyRequest, request: Request, db: Session = Depends(get_db)):
    check_rate_limit(f"auth:2fa:verify:{client_identifier(request)}", limit=20, window_seconds=300)
    try:
        context = load_pending_two_factor_context(db, payload.pending_token, require_active_challenge=True)
        user = verify_two_factor_code(db, context, payload.code)
        get_active_family(db, user)
        return AuthResponse(access_token=create_access_token(user.id, token_version=user.token_version), user=user)
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("Unexpected 2FA verify error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Nao foi possivel concluir a verificacao agora. Tente novamente em alguns minutos.",
        ) from exc


@router.post("/2fa/resend", response_model=TwoFactorRequiredResponse)
def resend_two_factor(payload: TwoFactorResendRequest, request: Request, db: Session = Depends(get_db)):
    check_rate_limit(f"auth:2fa:resend:{client_identifier(request)}", limit=10, window_seconds=300)
    context = load_pending_two_factor_context(db, payload.pending_token, require_active_challenge=True)
    return _two_factor_response(context.user, context.purpose, db)


@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_active_family(db, current_user)
    return current_user


@router.patch("/me", response_model=UserRead | TwoFactorRequiredResponse)
def update_me(payload: UserUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    next_email = payload.email.strip().lower() if payload.email else None
    email_changed = bool(next_email and next_email != current_user.email)
    if email_changed:
        if not two_factor_delivery_available():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Alteracao de e-mail indisponivel sem canal de verificacao configurado.",
            )
        try:
            user = update_user_profile(db, current_user, payload, commit=False)
            response = _two_factor_response(user, "signup", db, commit=False, enforce_cooldown=False)
            db.commit()
            return response
        except Exception:
            db.rollback()
            raise
    return update_user_profile(db, current_user, payload)


@router.post("/me/password", status_code=204)
def update_password(payload: PasswordUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    change_user_password(db, current_user, payload)
    return None


@router.post("/logout", status_code=204)
def logout(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    logout_user(db, current_user)
    return None


@router.delete("/me", status_code=204)
def delete_me(payload: PasswordConfirmation, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    delete_user_account(db, current_user, payload.current_password)
    return None
