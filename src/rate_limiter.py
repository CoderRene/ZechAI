import time
from dataclasses import dataclass

from limits import RateLimitItemPerSecond
from slowapi import Limiter
from slowapi.util import get_remote_address

from utils import env


def _env_bool(name: str, default: bool) -> bool:
    raw = env(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "t", "yes", "y", "on"}


def _env_int(name: str, default: int) -> int:
    raw = env(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class RateLimitExceeded(Exception):
    key: str
    retry_after_seconds: float

    def message(self) -> str:
        retry = max(0.0, float(self.retry_after_seconds))
        return f"Rate limit exceeded. Retry after {retry:.2f}s."


RATE_LIMIT_ENABLED = _env_bool("RATE_LIMIT_ENABLED", True)
RATE_LIMIT_MAX_REQUESTS = _env_int("RATE_LIMIT_MAX_REQUESTS", 10)
RATE_LIMIT_WINDOW_SECONDS = _env_int("RATE_LIMIT_WINDOW_SECONDS", 60)

# SlowAPI is request-oriented, but it exposes a limiter backed by `limits`.
# We reuse that limiter directly so HTTP and websocket traffic share one policy.
limiter = Limiter(key_func=get_remote_address, enabled=RATE_LIMIT_ENABLED)
rate_limit_item = RateLimitItemPerSecond(
    RATE_LIMIT_MAX_REQUESTS,
    max(1, RATE_LIMIT_WINDOW_SECONDS),
)


def build_rate_limit_key(
    *,
    user_id: str | None = None,
    session_id: str | None = None,
    remote_addr: str | None = None,
) -> str:
    uid = (user_id or "").strip()
    if uid:
        return f"user:{uid}"

    sid = (session_id or "").strip()
    if sid:
        return f"session:{sid}"

    addr = (remote_addr or "").strip()
    if addr:
        return f"ip:{addr}"

    return "anonymous"


def enforce_rate_limit(key: str) -> None:
    if not RATE_LIMIT_ENABLED:
        return

    if RATE_LIMIT_MAX_REQUESTS <= 0 or RATE_LIMIT_WINDOW_SECONDS <= 0:
        return

    allowed = limiter._limiter.hit(rate_limit_item, key)
    if allowed:
        return

    window_stats = limiter._limiter.get_window_stats(rate_limit_item, key)
    retry_after = float(window_stats.reset_time) - time.time()
    raise RateLimitExceeded(key=key, retry_after_seconds=max(0.0, retry_after))

