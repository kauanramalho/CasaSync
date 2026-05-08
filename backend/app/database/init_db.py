from app.database.base import Base
from app.database.session import engine

# Importing models here registers them in SQLAlchemy metadata.
from app.models import category, couple, family, integration, task, user  # noqa: F401


def create_database_tables() -> None:
    Base.metadata.create_all(bind=engine)

