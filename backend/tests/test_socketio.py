"""Socket.IO tests. Unlike the REST suite, these need a real running server
process reachable over HTTP — python-socketio's AsyncClient speaks the
Engine.IO transport protocol, not ASGI-in-process — so they connect to
SOCKETIO_TEST_URL (default http://127.0.0.1:8000) and skip cleanly if
nothing is listening there, rather than failing the whole suite. This is
also why they can't run via the in-process ASGITransport used everywhere
else in this suite; see docs/TESTING_GUIDE.md."""
import asyncio
import os

import httpx
import pytest
import socketio

from tests.conftest import API, ADMIN_CREDS, PARTNER_CREDS, CONSUMER_CREDS

BASE_URL = os.environ.get("SOCKETIO_TEST_URL", "http://127.0.0.1:8000")


def _server_reachable() -> bool:
    try:
        r = httpx.get(f"{BASE_URL}/health", timeout=2.0)
        return r.status_code == 200
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not _server_reachable(),
    reason=f"No live server reachable at {BASE_URL} — Socket.IO tests need a real running uvicorn process",
)


async def _get_token(creds: dict) -> str:
    async with httpx.AsyncClient(base_url=BASE_URL) as c:
        resp = await c.post(f"{API}/auth/login", json=creds)
        resp.raise_for_status()
        return resp.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _wait_until(predicate, timeout: float = 8.0, interval: float = 0.1) -> bool:
    """Polls `predicate()` until it's truthy or `timeout` elapses, returning
    as soon as it succeeds instead of always waiting a fixed duration.
    Replaces the fixed `sio.sleep(N)` pattern this file used to rely on:
    under a full 260+-test suite run, event delivery (client emit -> server
    handler -> DB write/broadcast -> client callback) occasionally takes
    longer than any fixed sleep would predict, but usually resolves in well
    under a second — a poll loop is fast in the common case and only pays
    the full timeout in a genuine failure, rather than a fixed sleep being
    both slow *and* still occasionally too short."""
    elapsed = 0.0
    while elapsed < timeout:
        if predicate():
            return True
        await asyncio.sleep(interval)
        elapsed += interval
    return predicate()


async def _get_seeded_address_and_service(c: httpx.AsyncClient, token: str) -> tuple[str | None, str | None]:
    addresses = (await c.get(f"{API}/consumer/addresses", headers=_auth(token))).json()
    home = next((a for a in addresses if a.get("label") == "Home"), None)
    services = (await c.get(f"{API}/consumer/services", headers=_auth(token))).json()
    match = next((s for s in services if "cleaning" in s["name"].lower()), None)
    return (
        home["id"] if home else None,
        match["id"] if match else (services[0]["id"] if services else None),
    )


async def _create_assigned_booking(scheduled_date: str) -> dict | None:
    """Creates a real booking, bypasses the unconfigured Billplz gateway (same
    workaround as tests/test_dispatch_engine_flow.py), then admin-overrides
    it straight to the seeded partner — deterministic, no ranked-candidate/
    decline dance needed. Returns None (caller should skip) if seed data is
    missing. Side effect: opens a real chat_threads row (see
    services/dispatch/engine.py::manual_override)."""
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as c:
        consumer_token = await _get_token(CONSUMER_CREDS)
        admin_token = await _get_token(ADMIN_CREDS)
        partner_token = await _get_token(PARTNER_CREDS)

        address_id, service_id = await _get_seeded_address_and_service(c, consumer_token)
        if not address_id or not service_id:
            return None

        created = await c.post(
            f"{API}/consumer/bookings",
            json={
                "service_id": service_id, "address_id": address_id,
                "scheduled_date": scheduled_date, "time_slot": "MORNING",
                "slot_start_time": "09:00:00", "slot_end_time": "11:00:00",
            },
            headers=_auth(consumer_token),
        )
        booking_id = created.json()["id"]

        from database import async_session
        from models.booking import Booking
        async with async_session() as db:
            booking = await db.get(Booking, booking_id)
            booking.booking_status = "CONFIRMED"
            await db.commit()

        partner_me = await c.get(f"{API}/partner/me", headers=_auth(partner_token))
        partner_id = partner_me.json()["id"]

        override = await c.post(
            f"{API}/dispatch/bookings/{booking_id}/override",
            json={"partner_id": partner_id, "reason": "pytest socket.io event test"},
            headers=_auth(admin_token),
        )
        if override.status_code != 200:
            return None

        threads = await c.get(f"{API}/chat/threads", headers=_auth(partner_token))
        thread = next((t for t in threads.json() if t["booking_id"] == booking_id), None)
        if not thread:
            return None

        return {
            "booking_id": booking_id, "thread_id": thread["id"],
            "consumer_token": consumer_token, "partner_token": partner_token,
        }


async def test_socketio_connects_with_a_valid_jwt():
    token = await _get_token(PARTNER_CREDS)
    sio = socketio.AsyncClient()
    try:
        await sio.connect(BASE_URL, auth={"token": token}, transports=["websocket"], socketio_path="socket.io", wait_timeout=10)
        assert sio.connected is True
    finally:
        await sio.disconnect()


async def test_socketio_rejects_a_missing_token():
    sio = socketio.AsyncClient()
    with pytest.raises(socketio.exceptions.ConnectionError):
        await sio.connect(BASE_URL, auth={}, transports=["websocket"], socketio_path="socket.io")


async def test_socketio_rejects_an_invalid_token():
    sio = socketio.AsyncClient()
    with pytest.raises(socketio.exceptions.ConnectionError):
        await sio.connect(BASE_URL, auth={"token": "not-a-real-jwt"}, transports=["websocket"], socketio_path="socket.io")


async def test_heartbeat_round_trip():
    token = await _get_token(ADMIN_CREDS)
    sio = socketio.AsyncClient()
    received = {}

    @sio.on("heartbeat:ack")
    def _on_ack(data):
        received["ack"] = data

    try:
        await sio.connect(BASE_URL, auth={"token": token}, transports=["websocket"], socketio_path="socket.io", wait_timeout=10)
        await sio.emit("heartbeat")
        assert await _wait_until(lambda: "ack" in received)
    finally:
        await sio.disconnect()


async def _connected_client(token: str) -> socketio.AsyncClient:
    """Root cause of the flakiness this used to paper over with longer
    sleeps: `socketio.AsyncClient.connect()` defaults to `wait_timeout=1` —
    it waits at most 1 second for the server's namespace-CONNECT
    acknowledgment after the transport itself is up. Our server's `connect`
    handler (services/realtime/socket_server.py) does 1-2 real DB round
    trips (resolving consumer_id/partner_id) over the SSH-tunnelled RDS
    connection before it acks; under concurrent test load that occasionally
    exceeds 1 second, so the client gave up and raised "One or more
    namespaces failed to connect" even though the connection would have
    succeeded a moment later. `wait_timeout=10` below is the actual fix.
    The retry is just defense-in-depth for genuine transient network
    hiccups — a real auth failure (bad/missing token) still raises
    immediately via ConnectionRefusedError before reaching this timeout."""
    last_error = None
    for attempt in range(2):
        sio = socketio.AsyncClient()
        try:
            await sio.connect(BASE_URL, auth={"token": token}, transports=["websocket"], socketio_path="socket.io", wait_timeout=10)
            return sio
        except socketio.exceptions.ConnectionError as e:
            last_error = e
            await sio.disconnect()
            if attempt == 0:
                await asyncio.sleep(1)
    raise last_error


async def test_booking_join_broadcasts_presence_to_the_other_participant():
    """Exercises services/realtime/socket_server.py's booking_join handler —
    authorization (only the consumer/assigned partner for that booking can
    join its room) plus the presence:online broadcast to the room's other
    occupant."""
    ctx = await _create_assigned_booking("2026-12-20")
    if ctx is None:
        pytest.skip("Could not set up an assigned booking (seed data or dispatch override unavailable)")

    consumer_sio = await _connected_client(ctx["consumer_token"])
    partner_sio = await _connected_client(ctx["partner_token"])
    received = {}

    @consumer_sio.on("presence:online")
    def _on_presence(data):
        received["presence"] = data

    try:
        # `.call()` (not `.emit()`) waits for the server handler's ack, so by
        # the time this returns the consumer is deterministically already
        # registered in the room server-side — no guessing needed before the
        # partner joins next and triggers the broadcast this test observes.
        await consumer_sio.call("booking:join", {"booking_id": ctx["booking_id"]})
        # Partner joins second so the consumer (already in the room) observes it.
        await partner_sio.call("booking:join", {"booking_id": ctx["booking_id"]})

        assert await _wait_until(lambda: "presence" in received)
        assert received["presence"]["booking_id"] == ctx["booking_id"]
        assert received["presence"]["role"] == "partner"
    finally:
        await consumer_sio.disconnect()
        await partner_sio.disconnect()


async def test_chat_typing_send_message_and_read_receipt_over_socket():
    """Exercises chat_typing, chat_send_message (real DB write + broadcast),
    and chat_read (marks messages read + read-receipt broadcast) —
    services/realtime/socket_server.py's three chat event handlers."""
    ctx = await _create_assigned_booking("2026-12-21")
    if ctx is None:
        pytest.skip("Could not set up an assigned booking (seed data or dispatch override unavailable)")

    consumer_sio = await _connected_client(ctx["consumer_token"])
    partner_sio = await _connected_client(ctx["partner_token"])
    received = {}

    @partner_sio.on("chat:typing")
    def _on_typing(data):
        received["typing"] = data

    @partner_sio.on("chat:new_message")
    def _on_message(data):
        received["message"] = data

    @consumer_sio.on("chat:read_receipt")
    def _on_read_receipt(data):
        received["read_receipt"] = data

    try:
        await consumer_sio.call("booking:join", {"booking_id": ctx["booking_id"]})
        await partner_sio.call("booking:join", {"booking_id": ctx["booking_id"]})

        await consumer_sio.emit("chat:typing", {"booking_id": ctx["booking_id"], "thread_id": ctx["thread_id"], "is_typing": True})
        assert await _wait_until(lambda: "typing" in received)
        assert received["typing"]["is_typing"] is True

        await consumer_sio.emit("chat:send_message", {"thread_id": ctx["thread_id"], "message": "pytest socket.io message"})
        assert await _wait_until(lambda: "message" in received)
        assert received["message"]["message"] == "pytest socket.io message"
        assert received["message"]["booking_id"] == ctx["booking_id"]

        await partner_sio.emit("chat:read", {"thread_id": ctx["thread_id"]})
        assert await _wait_until(lambda: "read_receipt" in received)
        assert received["read_receipt"]["thread_id"] == ctx["thread_id"]
        assert received["message"]["message_id"] in received["read_receipt"]["message_ids"]
    finally:
        await consumer_sio.disconnect()
        await partner_sio.disconnect()


async def test_partner_location_update_broadcasts_to_consumer():
    """Exercises partner_location_update — partner-only, broadcasts to the
    booking room excluding the sender."""
    ctx = await _create_assigned_booking("2026-12-22")
    if ctx is None:
        pytest.skip("Could not set up an assigned booking (seed data or dispatch override unavailable)")

    consumer_sio = await _connected_client(ctx["consumer_token"])
    partner_sio = await _connected_client(ctx["partner_token"])
    received = {}

    @consumer_sio.on("partner:location")
    def _on_location(data):
        received["location"] = data

    try:
        await consumer_sio.call("booking:join", {"booking_id": ctx["booking_id"]})
        await partner_sio.call("booking:join", {"booking_id": ctx["booking_id"]})

        await partner_sio.emit("partner:location_update", {"booking_id": ctx["booking_id"], "lat": 3.1201, "lng": 101.6544})
        assert await _wait_until(lambda: "location" in received)
        assert received["location"]["booking_id"] == ctx["booking_id"]
        assert received["location"]["lat"] == 3.1201
    finally:
        await consumer_sio.disconnect()
        await partner_sio.disconnect()


async def test_booking_leave_and_disconnect_emit_presence_offline():
    """Exercises booking_leave (room membership removal) and disconnect's
    presence:offline broadcast for every room a socket was still in."""
    ctx = await _create_assigned_booking("2026-12-23")
    if ctx is None:
        pytest.skip("Could not set up an assigned booking (seed data or dispatch override unavailable)")

    consumer_sio = await _connected_client(ctx["consumer_token"])
    partner_sio = await _connected_client(ctx["partner_token"])
    received = {"offline_events": []}

    @consumer_sio.on("presence:offline")
    def _on_offline(data):
        received["offline_events"].append(data)

    try:
        await consumer_sio.call("booking:join", {"booking_id": ctx["booking_id"]})
        await partner_sio.call("booking:join", {"booking_id": ctx["booking_id"]})

        await partner_sio.disconnect()

        assert await _wait_until(lambda: any(
            e.get("booking_id") == ctx["booking_id"] and e.get("role") == "partner"
            for e in received["offline_events"]
        ))
    finally:
        await consumer_sio.disconnect()
