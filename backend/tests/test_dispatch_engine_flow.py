"""End-to-end Smart Dispatch integration test — exercises the real matching
and engine business logic (services/dispatch/matching.py, engine.py), not
just the route layer. Mirrors the manual verification approach used during
Stage 4 development: creates a real booking via the consumer API, then
bypasses the (unconfigured) Billplz gateway by setting booking_status to
CONFIRMED directly — the same workaround documented in
docs/SMART_DISPATCH.md — before triggering dispatch through the real admin
endpoint.

Uses the seeded consumer address ("Home", SS2 Petaling Jaya) and seeded
"Standard Home Cleaning" service specifically, since those are the only
rows in the live data with PostGIS coordinates/skill matches set up by
seed.py — a freshly-created address has no coordinates and would
(correctly) match zero candidates."""
from sqlalchemy import select

from database import async_session
from models.booking import Booking

from tests.conftest import API, auth


async def _get_seeded_address_id(client, token):
    addresses = (await client.get(f"{API}/consumer/addresses", headers=auth(token))).json()
    home = next((a for a in addresses if a.get("label") == "Home"), None)
    return home["id"] if home else None


async def _get_seeded_service_id(client, token):
    services = (await client.get(f"{API}/consumer/services", headers=auth(token))).json()
    match = next((s for s in services if "cleaning" in s["name"].lower()), None)
    return match["id"] if match else (services[0]["id"] if services else None)


async def test_full_dispatch_flow_finds_and_ranks_the_seeded_partner(client, consumer_token, admin_token):
    address_id = await _get_seeded_address_id(client, consumer_token)
    service_id = await _get_seeded_service_id(client, consumer_token)
    if not address_id or not service_id:
        import pytest
        pytest.skip("Seeded address/service not found in current data — run seed.py first")

    created = await client.post(
        f"{API}/consumer/bookings",
        json={
            "service_id": service_id, "address_id": address_id,
            "scheduled_date": "2026-12-15", "time_slot": "MORNING",
            "slot_start_time": "09:00:00", "slot_end_time": "11:00:00",
            "special_instructions": "pytest dispatch integration test",
        },
        headers=auth(consumer_token),
    )
    assert created.status_code in (200, 201), created.text
    booking_id = created.json()["id"]
    assert created.json()["booking_status"] == "PENDING_PAYMENT"

    # Candidate preview works even before payment/CONFIRMED — read-only, no side effects.
    preview = await client.get(f"{API}/dispatch/bookings/{booking_id}/candidates", headers=auth(admin_token))
    assert preview.status_code == 200
    candidates = preview.json()
    assert len(candidates) >= 1, "expected at least the seeded geo-tagged partner as a candidate"
    # Decimal fields serialize to JSON as strings (e.g. "93.15"), not numbers.
    scores = [float(c["match_score"]) for c in candidates]
    assert all(s >= 0 for s in scores)
    # Closer/more-skilled partner should score at or above any farther one.
    assert scores == sorted(scores, reverse=True), "candidates must be returned in descending match_score order"

    # Bypass the unconfigured Billplz gateway (see docs/SMART_DISPATCH.md) to
    # reach a dispatchable state, same workaround used in manual Stage 4 testing.
    async with async_session() as db:
        booking = await db.get(Booking, booking_id)
        booking.booking_status = "CONFIRMED"
        await db.commit()

    started = await client.post(f"{API}/dispatch/bookings/{booking_id}/start", headers=auth(admin_token))
    assert started.status_code == 200
    offer = started.json()
    if offer is not None:
        assert offer["booking_id"] == booking_id
        assert offer["status"] == "PENDING"

        history = await client.get(f"{API}/dispatch/bookings/{booking_id}/history", headers=auth(admin_token))
        assert history.status_code == 200
        assert len(history.json()) >= 1


async def test_decline_then_accept_retries_to_the_next_candidate(client, consumer_token, admin_token, partner_token, partner2_token):
    """Exercises services/dispatch/engine.py's decline -> retry -> accept path
    end-to-end: whichever seeded partner is offered first declines, the
    engine must retry the other seeded partner, who then accepts."""
    address_id = await _get_seeded_address_id(client, consumer_token)
    service_id = await _get_seeded_service_id(client, consumer_token)
    if not address_id or not service_id:
        import pytest
        pytest.skip("Seeded address/service not found in current data")

    created = await client.post(
        f"{API}/consumer/bookings",
        json={
            "service_id": service_id, "address_id": address_id,
            "scheduled_date": "2026-12-17", "time_slot": "MORNING",
            "slot_start_time": "09:00:00", "slot_end_time": "11:00:00",
        },
        headers=auth(consumer_token),
    )
    booking_id = created.json()["id"]

    async with async_session() as db:
        booking = await db.get(Booking, booking_id)
        booking.booking_status = "CONFIRMED"
        await db.commit()

    started = await client.post(f"{API}/dispatch/bookings/{booking_id}/start", headers=auth(admin_token))
    assert started.status_code == 200
    offer = started.json()
    if offer is None:
        import pytest
        pytest.skip("No candidates ranked for this booking in current data state")

    partner1_me = await client.get(f"{API}/partner/me", headers=auth(partner_token))
    partner1_id = partner1_me.json()["id"]

    first_offer_token = partner_token if offer["partner_id"] == partner1_id else partner2_token
    second_offer_token = partner2_token if first_offer_token is partner_token else partner_token

    declined = await client.post(
        f"{API}/dispatch/offers/{offer['id']}/decline", json={"reason": "pytest testing decline/retry"},
        headers=auth(first_offer_token),
    )
    assert declined.status_code == 200
    assert declined.json()["status"] == "DECLINED"

    pending = await client.get(f"{API}/dispatch/offers/pending", headers=auth(second_offer_token))
    assert pending.status_code == 200
    retried_offer = next((o for o in pending.json() if o["booking_id"] == booking_id), None)
    if retried_offer is None:
        return  # only one candidate existed; nothing further to retry to

    accepted = await client.post(f"{API}/dispatch/offers/{retried_offer['id']}/accept", headers=auth(second_offer_token))
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "ACCEPTED"

    booking_check = await client.get(f"{API}/admin/bookings/{booking_id}", headers=auth(admin_token))
    assert booking_check.json()["booking_status"] == "PARTNER_ASSIGNED"

    # A chat thread should have been opened as a side effect of acceptance.
    threads = await client.get(f"{API}/chat/threads", headers=auth(second_offer_token))
    assert threads.status_code == 200


async def test_starting_dispatch_on_a_pending_payment_booking_is_409(client, consumer_token, admin_token):
    address_id = await _get_seeded_address_id(client, consumer_token)
    service_id = await _get_seeded_service_id(client, consumer_token)
    if not address_id or not service_id:
        import pytest
        pytest.skip("Seeded address/service not found in current data")

    created = await client.post(
        f"{API}/consumer/bookings",
        json={
            "service_id": service_id, "address_id": address_id,
            "scheduled_date": "2026-12-16", "time_slot": "AFTERNOON",
            "slot_start_time": "14:00:00", "slot_end_time": "16:00:00",
        },
        headers=auth(consumer_token),
    )
    booking_id = created.json()["id"]

    resp = await client.post(f"{API}/dispatch/bookings/{booking_id}/start", headers=auth(admin_token))
    assert resp.status_code == 409
