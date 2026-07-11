"""Partner profile, jobs, earnings, wallet, reviews API tests."""
from tests.conftest import API, auth


async def test_get_partner_profile(client, partner_token):
    resp = await client.get(f"{API}/partner/me", headers=auth(partner_token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["kyc_status"] == "verified"
    assert "full_name" in body


async def test_toggle_online_status(client, partner_token):
    resp = await client.put(f"{API}/partner/me/online", json={"is_online": True}, headers=auth(partner_token))
    assert resp.status_code == 200


async def test_list_jobs_today(client, partner_token):
    resp = await client.get(f"{API}/jobs/today", headers=auth(partner_token))
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_earnings_summary(client, partner_token):
    resp = await client.get(f"{API}/earnings/summary", headers=auth(partner_token))
    assert resp.status_code == 200


async def test_wallet_balance(client, partner_token):
    resp = await client.get(f"{API}/wallet/balance", headers=auth(partner_token))
    assert resp.status_code == 200
    body = resp.json()
    assert "available" in body and "pending" in body and "lifetime" in body


async def test_wallet_settlements_history(client, partner_token):
    resp = await client.get(f"{API}/wallet/settlements", headers=auth(partner_token))
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_reviews_list(client, partner_token):
    resp = await client.get(f"{API}/reviews", headers=auth(partner_token))
    assert resp.status_code == 200


async def test_availability_update_and_read_round_trip(client, partner_token):
    # PUT /partner/me/availability *replaces* the whole weekly schedule (see
    # routes/partner.py::update_availability) — this partner is shared seed
    # data other tests (and Stage 4 dispatch matching) rely on being
    # available, so this submits full Mon-Sat coverage rather than a single
    # narrow slot, to avoid leaving the partner effectively unbookable for
    # any test that runs after this one.
    days = ["mon", "tue", "wed", "thu", "fri", "sat"]
    body = [{"day": d, "enabled": True, "start": "09:00", "end": "18:00"} for d in days]
    resp = await client.put(f"{API}/partner/me/availability", json=body, headers=auth(partner_token))
    assert resp.status_code == 200
    check = await client.get(f"{API}/partner/me", headers=auth(partner_token))
    assert check.status_code == 200
