"""Authentication API tests — login, token validation, role-based access."""
import pytest

from tests.conftest import API, ADMIN_CREDS, PARTNER_CREDS, CONSUMER_CREDS, auth


async def test_login_with_valid_credentials_returns_tokens(client):
    resp = await client.post(f"{API}/auth/login", json=PARTNER_CREDS)
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert "refresh_token" in body


async def test_login_with_wrong_password_is_rejected(client):
    resp = await client.post(f"{API}/auth/login", json={"phone": PARTNER_CREDS["phone"], "password": "WrongPassword@999"})
    assert resp.status_code == 401


async def test_login_with_unknown_phone_is_rejected(client):
    resp = await client.post(f"{API}/auth/login", json={"phone": "+60199999999", "password": "anything"})
    assert resp.status_code in (401, 404)


async def test_protected_endpoint_without_token_is_401(client):
    resp = await client.get(f"{API}/partner/me")
    assert resp.status_code == 401


async def test_protected_endpoint_with_garbage_token_is_401(client):
    resp = await client.get(f"{API}/partner/me", headers=auth("not-a-real-jwt"))
    assert resp.status_code == 401


async def test_partner_only_endpoint_rejects_consumer_token(client, consumer_token):
    resp = await client.get(f"{API}/partner/me", headers=auth(consumer_token))
    assert resp.status_code == 403


async def test_admin_only_endpoint_rejects_partner_token(client, partner_token):
    resp = await client.get(f"{API}/admin/dashboard", headers=auth(partner_token))
    assert resp.status_code == 403


async def test_admin_login_returns_admin_role_token(client):
    resp = await client.post(f"{API}/auth/login", json=ADMIN_CREDS)
    assert resp.status_code == 200
    dashboard = await client.get(f"{API}/admin/dashboard", headers=auth(resp.json()["access_token"]))
    assert dashboard.status_code == 200


async def test_refresh_token_issues_a_new_access_token(client):
    login = await client.post(f"{API}/auth/login", json=PARTNER_CREDS)
    refresh_token = login.json()["refresh_token"]
    resp = await client.post(f"{API}/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    assert "access_token" in resp.json()
