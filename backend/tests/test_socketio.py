"""Socket.IO tests. Unlike the REST suite, these need a real running server
process reachable over HTTP — python-socketio's AsyncClient speaks the
Engine.IO transport protocol, not ASGI-in-process — so they connect to
SOCKETIO_TEST_URL (default http://127.0.0.1:8000) and skip cleanly if
nothing is listening there, rather than failing the whole suite. This is
also why they can't run via the in-process ASGITransport used everywhere
else in this suite; see docs/TESTING_GUIDE.md."""
import os

import httpx
import pytest
import socketio

from tests.conftest import API, ADMIN_CREDS, PARTNER_CREDS

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


async def test_socketio_connects_with_a_valid_jwt():
    token = await _get_token(PARTNER_CREDS)
    sio = socketio.AsyncClient()
    try:
        await sio.connect(BASE_URL, auth={"token": token}, transports=["websocket"], socketio_path="socket.io")
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
        await sio.connect(BASE_URL, auth={"token": token}, transports=["websocket"], socketio_path="socket.io")
        await sio.emit("heartbeat")
        await sio.sleep(1)
        assert "ack" in received
    finally:
        await sio.disconnect()
