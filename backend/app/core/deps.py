from fastapi import Depends, Header, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.database.session import get_db
from app.models.user import User


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não foi possível validar suas credenciais.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_token(token)
        user_id: str | None = payload.get("sub")
        token_version = payload.get("ver", 0)
        token_type = payload.get("typ", "access")
        if not user_id or token_type != "access":
            raise credentials_error
    except JWTError as exc:
        raise credentials_error from exc

    user = db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()
    if not user or user.token_version != token_version:
        raise credentials_error
    if not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Verifique seu e-mail para continuar.",
        )
    return user


def get_family_id(
    family_id: str | None = Query(default=None),
    active_family_id: str | None = Header(default=None, alias="X-CasaSync-Family-Id"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> str:
    from app.services.family_service import get_active_family, require_family_member

    requested_family_id = (family_id or active_family_id or "").strip() or None
    family = get_active_family(db, current_user) if requested_family_id is None else None
    resolved_family_id = family.id if family else requested_family_id
    if not resolved_family_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Crie ou entre em uma família para continuar.",
        )
    require_family_member(db, resolved_family_id, current_user.id)
    return resolved_family_id
