from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.security import create_access_token
from app.database.session import get_db
from app.models.user import User
from app.schemas.token import AuthResponse
from app.schemas.user import PasswordUpdate, UserCreate, UserLogin, UserRead, UserUpdate
from app.services.auth_service import (
    authenticate_user,
    change_user_password,
    delete_user_account,
    logout_user,
    register_user,
    update_user_profile,
)


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse, status_code=201)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    user = register_user(db, payload)
    return AuthResponse(access_token=create_access_token(user.id, token_version=user.token_version), user=user)


@router.post("/login", response_model=AuthResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = authenticate_user(db, payload.email, payload.password)
    return AuthResponse(access_token=create_access_token(user.id, token_version=user.token_version), user=user)


@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserRead)
def update_me(payload: UserUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
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
def delete_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    delete_user_account(db, current_user)
    return None
