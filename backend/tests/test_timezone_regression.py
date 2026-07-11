"""Regression tests for the codebase-wide naive-datetime timezone bug fixed
during the Final Hardening stage (see docs/today-work/CHANGELOG.md).

Root cause: `datetime.utcnow()` and bare `datetime.now()` both return a
*naive* datetime. When a naive datetime is written to a `timestamptz` column
via asyncpg, Postgres interprets it under the active session's `TimeZone`
setting rather than assuming UTC — silently wrong the moment that setting
isn't UTC. The fix is `utils.time.utc_now()`, a single timezone-aware helper
used everywhere `datetime.utcnow()` previously appeared (JWT claims, ORM
`default=`/`onupdate=` timestamp columns, and every route that stamps a
`*_at` field by hand).

These tests guard against a future regression back to a naive datetime."""
import re
from datetime import timedelta, timezone

from auth import create_access_token
from database import async_session
from models.notification import Notification
from utils.time import utc_now

from tests.conftest import API, auth


def test_utc_now_is_timezone_aware():
    now = utc_now()
    assert now.tzinfo is not None
    assert now.utcoffset() == timedelta(0)


def test_utc_now_advances_between_calls():
    first = utc_now()
    second = utc_now()
    assert second >= first


def test_jwt_access_token_iat_and_exp_survive_aware_datetime_round_trip():
    from config import get_settings
    from jose import jwt

    settings = get_settings()
    token = create_access_token(sub="11111111-1111-1111-1111-111111111111")
    # Decode without our wrapper to inspect the raw numeric claims python-jose
    # writes on the wire (exp/iat become unix timestamps, not datetimes).
    payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    assert isinstance(payload["iat"], int)
    assert isinstance(payload["exp"], int)
    expected_window = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    assert abs((payload["exp"] - payload["iat"]) - expected_window) <= 2


async def test_notification_created_at_round_trips_as_timezone_aware(client, consumer_token):
    """Directly exercises models.notification.Notification's `default=utc_now`
    against the live DB — the exact pattern used by every ORM model's
    created_at/updated_at column. A regression to `default=datetime.utcnow`
    would still pass at the Python level (SQLAlchemy doesn't validate
    tzinfo), so this must be a real DB round trip, not just an in-memory
    assertion."""
    payload_resp = await client.get(f"{API}/consumer/addresses", headers=auth(consumer_token))
    assert payload_resp.status_code == 200

    from auth import decode_token
    token_payload = decode_token(consumer_token)
    user_id = token_payload["sub"]

    async with async_session() as db:
        notif = Notification(
            user_id=user_id,
            title="pytest timezone regression check",
            message="Additive, safe to re-run — see test_timezone_regression.py",
            channel="IN_APP",
            notification_type="system",
        )
        db.add(notif)
        await db.commit()
        notif_id = notif.id

    # Re-fetch through a brand-new session/connection so the value we assert
    # on actually came back over the wire from Postgres, not from Python's
    # in-memory object.
    async with async_session() as db:
        reloaded = await db.get(Notification, notif_id)
        assert reloaded is not None
        assert reloaded.created_at.tzinfo is not None
        now = utc_now()
        assert now - timedelta(minutes=5) <= reloaded.created_at <= now + timedelta(minutes=1)


def test_no_naive_utcnow_reintroduced_in_application_code():
    """Static guard: fail loudly if `datetime.utcnow()` or a bare
    `datetime.now()` (no tz argument) reappears anywhere in application
    code. Scoped to source files only — this test file and comments/
    docstrings referencing the pattern by name are excluded."""
    import pathlib

    root = pathlib.Path(__file__).resolve().parent.parent
    skip_dirs = {"tests", "migrations", "__pycache__", ".git", "venv", ".venv", "docs", "scripts"}
    # utils/time.py documents the banned pattern by name in its own docstring
    # (explaining what utc_now() replaces) — that mention isn't a violation.
    skip_files = {root / "utils" / "time.py"}
    offenders = []
    naive_call = re.compile(r"datetime\.utcnow\(\)|(?<!\.)\bdatetime\.now\(\)(?!\s*,)")

    for path in root.rglob("*.py"):
        if any(part in skip_dirs for part in path.relative_to(root).parts):
            continue
        if path in skip_files:
            continue
        text = path.read_text(encoding="utf-8")
        for lineno, line in enumerate(text.splitlines(), start=1):
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            if naive_call.search(line):
                offenders.append(f"{path.relative_to(root)}:{lineno}: {stripped}")

    assert not offenders, "naive datetime usage found (use utils.time.utc_now() instead):\n" + "\n".join(offenders)
