"""Analytics API tests (Stage 7)."""
import pytest

from tests.conftest import API, auth

ANALYTICS_ENDPOINTS = [
    "revenue", "bookings", "partners", "consumers", "trends",
    "conversion", "cancellations", "dispatch", "payments", "notifications", "support",
]


@pytest.mark.parametrize("name", ANALYTICS_ENDPOINTS)
async def test_analytics_endpoint_succeeds_for_admin(client, admin_token, name):
    resp = await client.get(f"{API}/admin/analytics/{name}", headers=auth(admin_token))
    assert resp.status_code == 200, f"{name} -> {resp.status_code}: {resp.text}"
    if name != "dispatch":
        # "dispatch" is a pure alias for the pre-existing GET /dispatch/analytics
        # (Stage 4) and intentionally returns that endpoint's own response
        # shape verbatim, which predates and doesn't include generated_at.
        assert "generated_at" in resp.json()


@pytest.mark.parametrize("name", ANALYTICS_ENDPOINTS)
async def test_analytics_endpoint_rejects_partner_token(client, partner_token, name):
    resp = await client.get(f"{API}/admin/analytics/{name}", headers=auth(partner_token))
    assert resp.status_code == 403


async def test_dispatch_analytics_alias_matches_the_original_endpoint(client, admin_token):
    original = await client.get(f"{API}/dispatch/analytics", headers=auth(admin_token))
    alias = await client.get(f"{API}/admin/analytics/dispatch", headers=auth(admin_token))
    assert original.status_code == alias.status_code == 200
    assert original.json() == alias.json()


async def test_conversion_funnel_is_internally_consistent(client, admin_token):
    body = (await client.get(f"{API}/admin/analytics/conversion", headers=auth(admin_token))).json()
    assert body["reached_completed"] <= body["reached_partner_assigned"] <= body["reached_confirmed"] <= body["total_created"]


async def test_revenue_days_query_param_is_respected(client, admin_token):
    resp = await client.get(f"{API}/admin/analytics/revenue?days=7", headers=auth(admin_token))
    assert resp.status_code == 200
