from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.database.init_db import create_database_tables
from app.routes import auth, categories, couple, dashboard, families, integrations, planner, tasks


settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="API do CasaSync: tarefas colaborativas, família, gamificação e integrações futuras.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    # MVP-friendly. In production, prefer Alembic migrations before boot.
    create_database_tables()


@app.get("/health", tags=["health"])
def health_check():
    return {"status": "ok", "service": settings.app_name}


app.include_router(auth.router, prefix=settings.api_v1_prefix)
app.include_router(families.router, prefix=settings.api_v1_prefix)
app.include_router(categories.router, prefix=settings.api_v1_prefix)
app.include_router(tasks.router, prefix=settings.api_v1_prefix)
app.include_router(dashboard.router, prefix=settings.api_v1_prefix)
app.include_router(couple.router, prefix=settings.api_v1_prefix)
app.include_router(planner.router, prefix=settings.api_v1_prefix)
app.include_router(integrations.router, prefix=settings.api_v1_prefix)

