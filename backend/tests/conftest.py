"""
Shared pytest fixtures for the API/integration test suite.

Runs in-process against `main.app` via httpx's ASGITransport (no separate
uvicorn process needed) and the **real** `servisakudb` dev database (reached
via the same SSH tunnel used throughout this project — there is no separate
test/staging database provisioned). Tests are written to be additive/
idempotent wherever they create data, mirroring the idempotent seed.py
pattern, so re-running the suite is safe. See docs/TESTING_GUIDE.md.
"""
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from main import app

API = "/api/v1"

ADMIN_CREDS = {"phone": "+60100000001", "password": "Admin@123"}
PARTNER_CREDS = {"phone": "+60100000002", "password": "Partner@123"}
PARTNER2_CREDS = {"phone": "+60100000004", "password": "Partner@123"}
CONSUMER_CREDS = {"phone": "+60100000003", "password": "Customer@123"}


@pytest_asyncio.fixture(scope="session")
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


async def _login(client: AsyncClient, creds: dict) -> str:
    resp = await client.post(f"{API}/auth/login", json=creds)
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


@pytest_asyncio.fixture(scope="session")
async def admin_token(client):
    return await _login(client, ADMIN_CREDS)


@pytest_asyncio.fixture(scope="session")
async def partner_token(client):
    return await _login(client, PARTNER_CREDS)


@pytest_asyncio.fixture(scope="session")
async def partner2_token(client):
    return await _login(client, PARTNER2_CREDS)


@pytest_asyncio.fixture(scope="session")
async def consumer_token(client):
    return await _login(client, CONSUMER_CREDS)


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
