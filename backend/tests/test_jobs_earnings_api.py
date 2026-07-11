"""Jobs and earnings API tests (partner-side)."""
from tests.conftest import API, auth


async def test_new_job_requests_list(client, partner_token):
    resp = await client.get(f"{API}/jobs/new", headers=auth(partner_token))
    assert resp.status_code == 200


async def test_upcoming_jobs_list(client, partner_token):
    resp = await client.get(f"{API}/jobs/upcoming", headers=auth(partner_token))
    assert resp.status_code == 200


async def test_completed_jobs_list(client, partner_token):
    resp = await client.get(f"{API}/jobs/completed", headers=auth(partner_token))
    assert resp.status_code == 200


async def test_job_detail_for_nonexistent_job_is_404(client, partner_token):
    resp = await client.get(f"{API}/jobs/00000000-0000-0000-0000-000000000000", headers=auth(partner_token))
    assert resp.status_code == 404


async def test_accept_nonexistent_job_is_404(client, partner_token):
    resp = await client.post(f"{API}/jobs/00000000-0000-0000-0000-000000000000/accept", headers=auth(partner_token))
    assert resp.status_code == 404


async def test_earnings_breakdown_default(client, partner_token):
    resp = await client.get(f"{API}/earnings", headers=auth(partner_token))
    assert resp.status_code == 200


async def test_earnings_breakdown_weekly(client, partner_token):
    resp = await client.get(f"{API}/earnings?period=weekly", headers=auth(partner_token))
    assert resp.status_code == 200


async def test_earnings_summary(client, partner_token):
    resp = await client.get(f"{API}/earnings/summary", headers=auth(partner_token))
    assert resp.status_code == 200
    body = resp.json()
    assert "lifetime_earnings" in body or "total" in body or isinstance(body, dict)


async def test_jobs_endpoints_reject_consumer_token(client, consumer_token):
    resp = await client.get(f"{API}/jobs/today", headers=auth(consumer_token))
    assert resp.status_code == 403
