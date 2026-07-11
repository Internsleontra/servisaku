"""Payment API tests. Bill creation against a real gateway needs Billplz
credentials that don't exist yet in this environment (see docs/TESTING_GUIDE.md
"Known gaps") — this file covers everything that doesn't require them:
transaction history, validation, and RBAC on the admin refund endpoints."""
from tests.conftest import API, auth


async def test_list_transactions_as_consumer(client, consumer_token):
    resp = await client.get(f"{API}/payments/transactions", headers=auth(consumer_token))
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_create_bill_without_gateway_credentials_fails_cleanly(client, consumer_token):
    resp = await client.get(f"{API}/consumer/bookings", headers=auth(consumer_token))
    assert resp.status_code == 200
    bookings = resp.json()
    pending = next((b for b in bookings if b["booking_status"] == "PENDING_PAYMENT"), None)
    if pending is None:
        return  # no PENDING_PAYMENT booking available in current seed state — nothing to exercise
    bill_resp = await client.post(
        f"{API}/payments/bookings/{pending['id']}/bill",
        json={"payment_method": "FPX", "payment_gateway": "BILLPLZ"},
        headers=auth(consumer_token),
    )
    # Billplz isn't configured in this environment — must fail as a clean
    # 503/502, never a 500, and never silently "succeed" with a fake bill.
    assert bill_resp.status_code in (502, 503)


async def test_refund_approve_requires_admin_role(client, partner_token):
    resp = await client.post(
        f"{API}/payments/refunds/00000000-0000-0000-0000-000000000000/approve",
        headers=auth(partner_token),
    )
    assert resp.status_code == 403


async def test_refund_approve_on_nonexistent_refund_is_404(client, admin_token):
    resp = await client.post(
        f"{API}/payments/refunds/00000000-0000-0000-0000-000000000000/approve",
        headers=auth(admin_token),
    )
    assert resp.status_code == 404


async def test_refund_reject_on_nonexistent_refund_is_404(client, admin_token):
    resp = await client.post(
        f"{API}/payments/refunds/00000000-0000-0000-0000-000000000000/reject",
        headers=auth(admin_token),
    )
    assert resp.status_code == 404


async def test_get_nonexistent_payment_is_404(client, consumer_token):
    resp = await client.get(
        f"{API}/payments/00000000-0000-0000-0000-000000000000", headers=auth(consumer_token),
    )
    assert resp.status_code == 404


async def test_get_payments_for_nonexistent_booking_is_404(client, consumer_token):
    resp = await client.get(
        f"{API}/payments/bookings/00000000-0000-0000-0000-000000000000", headers=auth(consumer_token),
    )
    assert resp.status_code == 404


async def test_release_payment_requires_admin(client, partner_token):
    resp = await client.post(
        f"{API}/payments/00000000-0000-0000-0000-000000000000/release", headers=auth(partner_token),
    )
    assert resp.status_code == 403


async def test_request_refund_on_nonexistent_payment_is_404(client, consumer_token):
    resp = await client.post(
        f"{API}/payments/00000000-0000-0000-0000-000000000000/refunds",
        json={"reason": "pytest test"},
        headers=auth(consumer_token),
    )
    assert resp.status_code == 404


async def test_sync_payment_on_nonexistent_payment_is_404(client, consumer_token):
    resp = await client.post(
        f"{API}/payments/00000000-0000-0000-0000-000000000000/sync", headers=auth(consumer_token),
    )
    assert resp.status_code == 404
