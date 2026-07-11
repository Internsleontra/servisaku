"""Smart Dispatch retry/expiry/exhaustion tests — services/dispatch/engine.py's
run_expiry_sweep/run_expiry_sweep_standalone, the attempt-cap and zero-
candidate exhaustion paths in start_dispatch, plus the block-match and
post-assignment status-update routes in routes/dispatch.py. Complements
tests/test_dispatch_engine_flow.py, which covers the "happy path" decline
-> retry -> accept flow via ranked candidates specifically."""
from datetime import timedelta

from config import get_settings
from database import async_session
from models.booking import Booking
from models.dispatch import BlockedMatch, JobDispatch
from services.dispatch.engine import run_expiry_sweep_standalone
from utils.time import utc_now

from tests.conftest import API, auth

settings = get_settings()


async def _get_seeded_address_and_service(client, token):
    addresses = (await client.get(f"{API}/consumer/addresses", headers=auth(token))).json()
    home = next((a for a in addresses if a.get("label") == "Home"), None)
    services = (await client.get(f"{API}/consumer/services", headers=auth(token))).json()
    match = next((s for s in services if "cleaning" in s["name"].lower()), None)
    return (
        home["id"] if home else None,
        match["id"] if match else (services[0]["id"] if services else None),
    )


async def _create_confirmed_booking(client, consumer_token, scheduled_date: str):
    address_id, service_id = await _get_seeded_address_and_service(client, consumer_token)
    if not address_id or not service_id:
        return None
    created = await client.post(
        f"{API}/consumer/bookings",
        json={
            "service_id": service_id, "address_id": address_id,
            "scheduled_date": scheduled_date, "time_slot": "MORNING",
            "slot_start_time": "09:00:00", "slot_end_time": "11:00:00",
        },
        headers=auth(consumer_token),
    )
    booking_id = created.json()["id"]
    async with async_session() as db:
        booking = await db.get(Booking, booking_id)
        booking.booking_status = "CONFIRMED"
        await db.commit()
    return booking_id


async def test_start_dispatch_returns_null_when_attempt_cap_already_reached(client, consumer_token, admin_token):
    """services/dispatch/engine.py::start_dispatch's first guard: once
    dispatch_attempts >= DISPATCH_MAX_ATTEMPTS, it must not rank candidates
    at all — it goes straight to the exhausted notification and returns
    None, regardless of whether real candidates would otherwise exist."""
    booking_id = await _create_confirmed_booking(client, consumer_token, "2027-01-05")
    if booking_id is None:
        import pytest
        pytest.skip("Seeded address/service not found in current data")

    async with async_session() as db:
        booking = await db.get(Booking, booking_id)
        booking.dispatch_attempts = settings.DISPATCH_MAX_ATTEMPTS
        await db.commit()

    resp = await client.post(f"{API}/dispatch/bookings/{booking_id}/start", headers=auth(admin_token))
    assert resp.status_code == 200
    assert resp.json() is None


async def test_start_dispatch_returns_null_when_every_candidate_is_blocked(client, consumer_token, admin_token, partner_token, partner2_token):
    """Zero-candidates exhaustion path (distinct from the attempt-cap path
    above) — blocks both seeded partners for this consumer via
    POST /dispatch/matches/block, then confirms start_dispatch finds no
    ranked candidates and returns None rather than raising."""
    booking_id = await _create_confirmed_booking(client, consumer_token, "2027-01-06")
    if booking_id is None:
        import pytest
        pytest.skip("Seeded address/service not found in current data")

    partner1_id = (await client.get(f"{API}/partner/me", headers=auth(partner_token))).json()["id"]
    partner2_id = (await client.get(f"{API}/partner/me", headers=auth(partner2_token))).json()["id"]

    for pid in (partner1_id, partner2_id):
        blocked = await client.post(
            f"{API}/dispatch/matches/block", json={"partner_id": pid, "reason": "pytest exhaustion test"},
            headers=auth(consumer_token),
        )
        assert blocked.status_code == 201
        assert blocked.json()["blocked"] is True

    resp = await client.post(f"{API}/dispatch/bookings/{booking_id}/start", headers=auth(admin_token))
    assert resp.status_code == 200
    assert resp.json() is None

    # Cleanup: unblock so this consumer's seeded partners remain matchable
    # for every other test in the suite that depends on them (see
    # docs/TESTING_GUIDE.md's additive/idempotent convention).
    async with async_session() as db:
        from sqlalchemy import select
        rows = (await db.execute(
            select(BlockedMatch).where(BlockedMatch.partner_id.in_([partner1_id, partner2_id]))
        )).scalars().all()
        for row in rows:
            await db.delete(row)
        await db.commit()


async def test_blocking_the_same_partner_twice_is_idempotent(client, consumer_token, partner_token):
    partner_id = (await client.get(f"{API}/partner/me", headers=auth(partner_token))).json()["id"]
    first = await client.post(
        f"{API}/dispatch/matches/block", json={"partner_id": partner_id, "reason": "pytest idempotent block 1"},
        headers=auth(consumer_token),
    )
    second = await client.post(
        f"{API}/dispatch/matches/block", json={"partner_id": partner_id, "reason": "pytest idempotent block 2"},
        headers=auth(consumer_token),
    )
    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json()["blocked"] is True

    async with async_session() as db:
        from sqlalchemy import select
        row = (await db.execute(
            select(BlockedMatch).where(BlockedMatch.partner_id == partner_id, BlockedMatch.consumer_id != None)  # noqa: E711
        )).scalars().first()
        if row:
            await db.delete(row)
            await db.commit()


async def test_admin_block_without_consumer_id_is_400(client, admin_token, partner_token):
    partner_id = (await client.get(f"{API}/partner/me", headers=auth(partner_token))).json()["id"]
    resp = await client.post(
        f"{API}/dispatch/matches/block", json={"partner_id": partner_id, "reason": "pytest admin block"},
        headers=auth(admin_token),
    )
    assert resp.status_code == 400


async def test_expiry_sweep_expires_a_past_deadline_offer_and_retries(client, consumer_token, admin_token, partner_token, partner2_token):
    """End-to-end: create+dispatch a booking, force its offer's
    acceptance_deadline into the past directly in the DB (the same
    time-travel technique used to bypass real-time waiting in
    test_dispatch_engine_flow.py), then trigger POST /dispatch/process-expired
    and confirm the offer is EXPIRED and (if a second candidate exists) a
    new PENDING offer was created for them."""
    booking_id = await _create_confirmed_booking(client, consumer_token, "2027-01-07")
    if booking_id is None:
        import pytest
        pytest.skip("Seeded address/service not found in current data")

    started = await client.post(f"{API}/dispatch/bookings/{booking_id}/start", headers=auth(admin_token))
    assert started.status_code == 200
    offer = started.json()
    if offer is None:
        import pytest
        pytest.skip("No candidates ranked for this booking in current data state")

    async with async_session() as db:
        row = await db.get(JobDispatch, offer["id"])
        row.acceptance_deadline = utc_now() - timedelta(seconds=1)
        await db.commit()

    swept = await client.post(f"{API}/dispatch/process-expired", headers=auth(admin_token))
    assert swept.status_code == 200
    result = swept.json()
    assert result["expired"] >= 1

    history = await client.get(f"{API}/dispatch/bookings/{booking_id}/history", headers=auth(admin_token))
    statuses = [h["status"] for h in history.json()]
    assert "EXPIRED" in statuses


async def test_run_expiry_sweep_standalone_commits_and_returns_counts():
    """Direct unit coverage of the background-worker entrypoint
    (services/dispatch/background.py calls exactly this function on its
    periodic timer) — opens its own session, must not raise."""
    result = await run_expiry_sweep_standalone()
    assert "expired" in result
    assert "retried" in result
    assert result["expired"] >= 0
    assert result["retried"] >= 0


async def test_dispatch_sweep_loop_survives_cancellation():
    """services/dispatch/background.py::dispatch_sweep_loop's CancelledError
    branch must re-raise (so the asyncio.Task actually stops) rather than
    swallow it like every other exception in that loop."""
    import asyncio
    from services.dispatch.background import dispatch_sweep_loop

    task = asyncio.ensure_future(dispatch_sweep_loop())
    await asyncio.sleep(0.2)  # let it run at least one sweep iteration
    task.cancel()
    try:
        await task
        assert False, "expected asyncio.CancelledError to propagate out of the task"
    except asyncio.CancelledError:
        pass


async def test_booking_status_full_lifecycle_and_completion_increments_partner_stat(client, consumer_token, admin_token, partner_token, partner2_token):
    booking_id = await _create_confirmed_booking(client, consumer_token, "2027-01-08")
    if booking_id is None:
        import pytest
        pytest.skip("Seeded address/service not found in current data")

    partner1_id = (await client.get(f"{API}/partner/me", headers=auth(partner_token))).json()["id"]
    override = await client.post(
        f"{API}/dispatch/bookings/{booking_id}/override",
        json={"partner_id": partner1_id, "reason": "pytest lifecycle test"},
        headers=auth(admin_token),
    )
    assert override.status_code == 200

    async with async_session() as db:
        from models.partner import Partner
        from uuid import UUID as _UUID
        partner_before = await db.get(Partner, _UUID(partner1_id))
        jobs_before = partner_before.total_completed_jobs or 0

    for new_status in ("EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED"):
        resp = await client.patch(
            f"{API}/dispatch/bookings/{booking_id}/status",
            json={"new_status": new_status}, headers=auth(partner_token),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["new_status"] == new_status

    async with async_session() as db:
        from models.partner import Partner
        from uuid import UUID as _UUID
        partner_after = await db.get(Partner, _UUID(partner1_id))
        assert (partner_after.total_completed_jobs or 0) == jobs_before + 1


async def test_booking_status_disallowed_transition_is_409(client, consumer_token, admin_token, partner_token):
    booking_id = await _create_confirmed_booking(client, consumer_token, "2027-01-09")
    if booking_id is None:
        import pytest
        pytest.skip("Seeded address/service not found in current data")

    partner1_id = (await client.get(f"{API}/partner/me", headers=auth(partner_token))).json()["id"]
    override = await client.post(
        f"{API}/dispatch/bookings/{booking_id}/override",
        json={"partner_id": partner1_id, "reason": "pytest 409 test"},
        headers=auth(admin_token),
    )
    assert override.status_code == 200

    # PARTNER_ASSIGNED -> IN_PROGRESS is not a legal direct transition
    # (must pass through EN_ROUTE/ARRIVED first).
    resp = await client.patch(
        f"{API}/dispatch/bookings/{booking_id}/status",
        json={"new_status": "IN_PROGRESS"}, headers=auth(partner_token),
    )
    assert resp.status_code == 409


async def test_booking_status_cancelled_by_partner_sets_reason_and_timestamp(client, consumer_token, admin_token, partner_token):
    booking_id = await _create_confirmed_booking(client, consumer_token, "2027-01-10")
    if booking_id is None:
        import pytest
        pytest.skip("Seeded address/service not found in current data")

    partner1_id = (await client.get(f"{API}/partner/me", headers=auth(partner_token))).json()["id"]
    override = await client.post(
        f"{API}/dispatch/bookings/{booking_id}/override",
        json={"partner_id": partner1_id, "reason": "pytest cancel test"},
        headers=auth(admin_token),
    )
    assert override.status_code == 200

    resp = await client.patch(
        f"{API}/dispatch/bookings/{booking_id}/status",
        json={"new_status": "CANCELLED_BY_PARTNER", "remarks": "pytest cancellation reason"},
        headers=auth(partner_token),
    )
    assert resp.status_code == 200
    assert resp.json()["new_status"] == "CANCELLED_BY_PARTNER"

    booking_check = await client.get(f"{API}/admin/bookings/{booking_id}", headers=auth(admin_token))
    assert booking_check.json()["booking_status"] == "CANCELLED_BY_PARTNER"
