"""Consumer-facing API tests: catalog browsing, addresses, bookings."""
from tests.conftest import API, auth


async def test_list_service_categories(client, consumer_token):
    resp = await client.get(f"{API}/consumer/service-categories", headers=auth(consumer_token))
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    assert len(resp.json()) > 0


async def test_list_services(client, consumer_token):
    resp = await client.get(f"{API}/consumer/services", headers=auth(consumer_token))
    assert resp.status_code == 200


async def test_list_addresses(client, consumer_token):
    resp = await client.get(f"{API}/consumer/addresses", headers=auth(consumer_token))
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_create_address(client, consumer_token):
    resp = await client.post(
        f"{API}/consumer/addresses",
        json={
            "label": "Pytest Test Address", "street_address": "1 Pytest Street",
            "postcode": "50000", "is_default": False,
        },
        headers=auth(consumer_token),
    )
    assert resp.status_code in (200, 201)
    body = resp.json()
    assert body["street_address"] == "1 Pytest Street"


async def test_list_bookings(client, consumer_token):
    resp = await client.get(f"{API}/consumer/bookings", headers=auth(consumer_token))
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_create_booking_with_unknown_service_is_404_or_422(client, consumer_token):
    addresses = (await client.get(f"{API}/consumer/addresses", headers=auth(consumer_token))).json()
    address_id = addresses[0]["id"] if addresses else "00000000-0000-0000-0000-000000000000"
    resp = await client.post(
        f"{API}/consumer/bookings",
        json={
            "service_id": "00000000-0000-0000-0000-000000000000", "address_id": address_id,
            "scheduled_date": "2026-12-01", "time_slot": "MORNING",
            "slot_start_time": "09:00:00", "slot_end_time": "11:00:00",
        },
        headers=auth(consumer_token),
    )
    assert resp.status_code in (404, 422)


async def test_consumer_endpoints_reject_partner_token(client, partner_token):
    resp = await client.get(f"{API}/consumer/bookings", headers=auth(partner_token))
    assert resp.status_code == 403
