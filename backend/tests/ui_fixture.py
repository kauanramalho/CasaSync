"""Local-only UI QA server: in-memory DB, synthetic data, no external providers.

Run from backend: .venv/Scripts/python.exe -m tests.ui_fixture
Login: uiqa / UiQa-local-2026 (disposable fixture, never a production credential).
"""
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import config

# Do not import app.main: its startup migrates the configured database.
settings = config.Settings(
    _env_file=None, database_url="sqlite:///:memory:", environment="development",
    jwt_secret_key="disposable-ui-fixture-only-not-a-production-secret",
    email_dev_mode=False, web_push_enabled=False, email_notifications_enabled=False,
    openai_vision_enabled=False, google_calendar_enabled=False,
)
config.get_settings = lambda: settings

from app.core.security import hash_password
from app.database.base import Base
from app.database import session as database_session
from app.database.session import get_db
from app.models import Category, Family, FamilyMember, User
from app.routes import auth, categories, couple, dashboard, families, image_analysis, integrations, notifications, planner, tasks, uploads
from app.schemas.task import TaskCreate
from app.services.task_service import create_task

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)
# Background task-event delivery opens its own session after the HTTP response.
# Keep it on the same disposable database; never touch a configured database.
database_session.SessionLocal = Session
with Session() as db:
    user = User(id="uiqa-user", username="uiqa", name="QA Local", email="uiqa@example.com", hashed_password=hash_password("UiQa-local-2026"), email_verified=True, two_factor_enabled=False)
    families_data = [Family(id="uiqa-home", name="Família de teste com nome bastante longo para validar telas pequenas", invite_code="UIQA01", image_url="http://localhost:5173/icons/icon-512.png"), Family(id="uiqa-other", name="Segunda família", invite_code="UIQA02")]
    db.add_all([user, *families_data]); db.flush()
    db.add_all([FamilyMember(family_id=family.id, user_id=user.id, role="owner" if index == 0 else "member") for index, family in enumerate(families_data)])
    user.active_family_id = families_data[0].id
    db.commit()
    create_task(db, family_id=families_data[0].id, creator_id=user.id, payload=TaskCreate(title="Tarefa atrasada com título muito longo para verificar a seção precisa de atenção", due_date=datetime.now(timezone.utc) - timedelta(days=2)))
    for name, color, icon in [("Casa", "rose", "home"), ("Saúde", "emerald", "heart"), ("Trabalho", "blue", "briefcase"), ("Estudos", "purple", "book"), ("Compras", "amber", "shopping-cart"), ("Categoria com nome muito longo para verificar quebra", "slate", "sparkles")]:
        db.add(Category(family_id=families_data[0].id, name=name, color=color, icon=icon, is_default=False))
    db.commit()
    create_task(db, family_id=families_data[0].id, creator_id=user.id, payload=TaskCreate(title="Compromisso de teste no calendário", due_date=datetime.now(timezone.utc) + timedelta(hours=2)))

def fixture_db():
    with Session() as db:
        yield db

app = FastAPI(title="CasaSync isolated UI fixture")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["Authorization", "Content-Type", "X-CasaSync-Family-Id"])
app.dependency_overrides[get_db] = fixture_db

for module in [auth, categories, couple, dashboard, families, image_analysis, integrations, notifications, planner, tasks, uploads]:
    app.include_router(module.router, prefix="/api")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")
