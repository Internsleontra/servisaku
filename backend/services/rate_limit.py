"""Shared slowapi Limiter instance for sensitive-endpoint rate limiting.

Uses per-client-IP in-memory buckets by default (`RATE_LIMIT_STORAGE_URI=
memory://`) — correct for the single-worker deployment this project
currently targets (see docs/DEPLOYMENT.md). Set `RATE_LIMIT_STORAGE_URI` to
a `redis://` URL before running multiple uvicorn workers, otherwise each
worker enforces its own independent counters instead of a shared one — the
same in-process-state caveat documented for Socket.IO in
docs/SOCKET_SCALING.md.

`RATE_LIMIT_ENABLED=false` is used by the test suite (see tests/conftest.py)
so functional tests aren't tripped by their own repeated requests; specific
rate-limit behavior is instead covered by tests/test_rate_limiting.py, which
flips `limiter.enabled` on for the duration of its own assertions.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

from config import get_settings

settings = get_settings()

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.RATE_LIMIT_STORAGE_URI,
    enabled=settings.RATE_LIMIT_ENABLED,
    # Adds X-RateLimit-*/Retry-After response headers so well-behaved
    # clients (including the mobile app) can back off correctly instead of
    # guessing.
    headers_enabled=True,
)
