"""Serialize reminder delivery across browser requests and scheduler runs."""

from contextlib import contextmanager
from threading import Lock

from sqlalchemy import text
from sqlalchemy.orm import Session


REMINDER_LOCK_KEY = 1129534001
_local_lock = Lock()


@contextmanager
def reminder_delivery_lock(db: Session):
    bind = db.get_bind()
    if bind.dialect.name != "postgresql":
        acquired = _local_lock.acquire(blocking=False)
        try:
            yield acquired
        finally:
            if acquired:
                _local_lock.release()
        return

    # Keep a separate transaction open across service commits. Transaction-level
    # advisory locks also work with Neon's transaction-pooled connections and are
    # released automatically on rollback/close, including after exceptions.
    engine = getattr(bind, "engine", bind)
    with engine.connect() as connection:
        acquired = bool(connection.scalar(text("SELECT pg_try_advisory_xact_lock(:key)"), {"key": REMINDER_LOCK_KEY}))
        yield acquired
