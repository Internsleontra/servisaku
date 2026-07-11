"""Notification API tests: in-app list, device tokens, preferences, delivery logs."""
from tests.conftest import API, auth


async def test_list_in_app_notifications(client, partner_token):
    resp = await client.get(f"{API}/notifications", headers=auth(partner_token))
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_unread_count(client, partner_token):
    resp = await client.get(f"{API}/notifications/unread-count", headers=auth(partner_token))
    assert resp.status_code == 200
    assert "count" in resp.json()


async def test_register_and_list_device_token(client, partner_token):
    register = await client.post(
        f"{API}/notifications/device-tokens",
        json={"device_token": "pytest-test-token-1234567890", "device_type": "android"},
        headers=auth(partner_token),
    )
    assert register.status_code in (200, 201)

    listing = await client.get(f"{API}/notifications/device-tokens", headers=auth(partner_token))
    assert listing.status_code == 200
    tokens = [t["device_token"] for t in listing.json()]
    assert "pytest-test-token-1234567890" in tokens


async def test_get_preferences_auto_creates_defaults(client, consumer_token):
    resp = await client.get(f"{API}/notifications/preferences", headers=auth(consumer_token))
    assert resp.status_code == 200
    body = resp.json()
    assert "booking_push" in body


async def test_delivery_logs_list(client, partner_token):
    resp = await client.get(f"{API}/notifications/logs", headers=auth(partner_token))
    assert resp.status_code == 200


async def test_admin_only_retry_failed_rejects_non_admin(client, partner_token):
    resp = await client.post(f"{API}/notifications/retry-failed", headers=auth(partner_token))
    assert resp.status_code == 403
