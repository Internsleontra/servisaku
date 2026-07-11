"""Smart Dispatch API tests."""
from tests.conftest import API, auth


async def test_pending_offers_list(client, partner_token):
    resp = await client.get(f"{API}/dispatch/offers/pending", headers=auth(partner_token))
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_dispatch_analytics_requires_admin(client, partner_token):
    resp = await client.get(f"{API}/dispatch/analytics", headers=auth(partner_token))
    assert resp.status_code == 403


async def test_dispatch_analytics_shape(client, admin_token):
    resp = await client.get(f"{API}/dispatch/analytics", headers=auth(admin_token))
    assert resp.status_code == 200
    body = resp.json()
    for key in ("total_offers", "by_status", "acceptance_rate_pct", "assigned_bookings"):
        assert key in body


async def test_candidate_preview_for_nonexistent_booking_is_404(client, admin_token):
    resp = await client.get(
        f"{API}/dispatch/bookings/00000000-0000-0000-0000-000000000000/candidates",
        headers=auth(admin_token),
    )
    assert resp.status_code == 404


async def test_accept_offer_on_nonexistent_offer_is_404(client, partner_token):
    resp = await client.post(
        f"{API}/dispatch/offers/00000000-0000-0000-0000-000000000000/accept",
        headers=auth(partner_token),
    )
    assert resp.status_code == 404


async def test_manual_override_rejects_nonexistent_booking(client, admin_token):
    resp = await client.post(
        f"{API}/dispatch/bookings/00000000-0000-0000-0000-000000000000/override",
        json={"partner_id": "00000000-0000-0000-0000-000000000000"},
        headers=auth(admin_token),
    )
    assert resp.status_code == 404
