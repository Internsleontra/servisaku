from datetime import datetime, timezone


def utc_now() -> datetime:
    """Timezone-aware current UTC time.

    Always use this instead of `datetime.utcnow()` / bare `datetime.now()`.
    Both return a naive datetime; when that naive value is written to a
    `timestamptz` column, asyncpg sends it as-is and Postgres interprets it
    under the active session's `TimeZone` setting rather than assuming UTC —
    silently wrong the moment that setting isn't UTC. `datetime.now(timezone.utc)`
    is unambiguous regardless of session timezone.
    """
    return datetime.now(timezone.utc)
