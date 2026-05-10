from collections import defaultdict, deque
from threading import Lock
from time import time

from fastapi import HTTPException, Request, status


_BUCKETS: dict[str, deque[float]] = defaultdict(deque)
_LOCK = Lock()


def client_identifier(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    return request.client.host if request.client else "unknown"


def check_rate_limit(key: str, *, limit: int, window_seconds: int) -> None:
    now = time()
    window_start = now - window_seconds

    with _LOCK:
        bucket = _BUCKETS[key]
        while bucket and bucket[0] < window_start:
            bucket.popleft()
        if len(bucket) >= limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Muitas tentativas. Aguarde um pouco e tente novamente.",
            )
        bucket.append(now)
