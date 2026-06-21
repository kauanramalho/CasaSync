from collections import defaultdict, deque
from threading import Lock
from time import time

from fastapi import HTTPException, Request, status


_BUCKETS: dict[str, deque[float]] = defaultdict(deque)
_LOCK = Lock()
_MAX_BUCKETS = 10_000
_MAX_RETENTION_SECONDS = 3_600


def _rate_limit_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Muitas tentativas. Aguarde um pouco e tente novamente.",
    )


def _prune_expired_buckets(cutoff: float) -> None:
    expired_keys = [key for key, bucket in _BUCKETS.items() if not bucket or bucket[-1] < cutoff]
    for key in expired_keys:
        _BUCKETS.pop(key, None)


def client_identifier(request: Request) -> str:
    # Uvicorn resolves trusted proxy headers into request.client. Reading
    # X-Forwarded-For directly would let an untrusted client rotate identities.
    return request.client.host if request.client else "unknown"


def check_rate_limit(key: str, *, limit: int, window_seconds: int) -> None:
    now = time()
    window_start = now - window_seconds

    with _LOCK:
        if key not in _BUCKETS and len(_BUCKETS) >= _MAX_BUCKETS:
            _prune_expired_buckets(now - _MAX_RETENTION_SECONDS)
            if len(_BUCKETS) >= _MAX_BUCKETS:
                raise _rate_limit_error()
        bucket = _BUCKETS[key]
        while bucket and bucket[0] < window_start:
            bucket.popleft()
        if len(bucket) >= limit:
            raise _rate_limit_error()
        bucket.append(now)
