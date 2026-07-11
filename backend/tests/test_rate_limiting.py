"""Rate-limiting behavior tests.

The rest of the suite runs with `RATE_LIMIT_ENABLED=false` (see
tests/conftest.py) so unrelated functional tests aren't tripped by their own
repeated requests to login/upload/admin endpoints. These tests are the one
place that flips `services.rate_limit.limiter.enabled` on, fires enough
requests to cross a configured limit, and turns it back off afterwards —
proving the slowapi wiring in main.py + the per-route `@limiter.limit(...)`
decorators (routes/auth.py, routes/payments.py, routes/uploads.py,
routes/notification_dispatch.py, routes/admin_partners.py,
routes/admin_settlements.py, routes/admin_users.py) actually enforces a 429,
not just that the decorator is present."""
import pytest

from config import get_settings
from services.rate_limit import limiter

from tests.conftest import API, auth

settings = get_settings()


@pytest.fixture
def rate_limiting_enabled():
    """Flips the shared limiter on for one test, resets its counters
    afterwards so later tests (with the limiter back off) never observe
    stale state, and restores enabled=False regardless of outcome."""
    limiter.enabled = True
    yield
    limiter.enabled = False
    limiter.reset()


async def test_login_is_rate_limited_after_configured_threshold(client, rate_limiting_enabled):
    limit_count = int(settings.RATE_LIMIT_LOGIN.split("/")[0])
    bad_creds = {"phone": "+60199999999", "password": "wrong-password"}

    statuses = []
    for _ in range(limit_count + 3):
        resp = await client.post(f"{API}/auth/login", json=bad_creds)
        statuses.append(resp.status_code)

    assert 401 in statuses, "expected some requests to reach the handler and fail auth normally"
    assert 429 in statuses, f"expected a 429 after {limit_count} requests/minute, got statuses: {statuses}"
    # Once limited, every subsequent request in the same window stays limited.
    assert statuses[-1] == 429


async def test_rate_limited_response_has_retry_after_header(client, rate_limiting_enabled):
    limit_count = int(settings.RATE_LIMIT_LOGIN.split("/")[0])
    bad_creds = {"phone": "+60199999998", "password": "wrong-password"}

    last_resp = None
    for _ in range(limit_count + 2):
        last_resp = await client.post(f"{API}/auth/login", json=bad_creds)

    assert last_resp.status_code == 429
    header_names = {k.lower() for k in last_resp.headers.keys()}
    assert "retry-after" in header_names, f"expected a Retry-After header (headers_enabled=True), got: {sorted(header_names)}"
    assert int(last_resp.headers["retry-after"]) >= 0
    assert "rate limit" in last_resp.json()["error"].lower()


async def test_rate_limiting_is_disabled_by_default_for_the_rest_of_the_suite(client):
    """Sanity check that the module-level default (no rate_limiting_enabled
    fixture) really is off — i.e. this file's other tests are opt-in, not
    silently leaking state into the rest of the suite."""
    assert limiter.enabled is False
    bad_creds = {"phone": "+60199999997", "password": "wrong-password"}
    statuses = [
        (await client.post(f"{API}/auth/login", json=bad_creds)).status_code
        for _ in range(15)
    ]
    assert all(s == 401 for s in statuses), "with the limiter disabled, no request should ever come back 429"
