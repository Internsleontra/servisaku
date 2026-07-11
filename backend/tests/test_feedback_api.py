"""Feedback API tests."""
from tests.conftest import API, auth


async def test_submit_feedback(client, partner_token):
    resp = await client.post(
        f"{API}/feedback",
        json={"type": "general", "subject": "Pytest test feedback", "body": "This is a test feedback submission from the automated suite."},
        headers=auth(partner_token),
    )
    assert resp.status_code in (200, 201)


async def test_submit_feedback_with_too_short_body_is_422(client, partner_token):
    resp = await client.post(
        f"{API}/feedback",
        json={"type": "general", "subject": "Too short", "body": "short"},
        headers=auth(partner_token),
    )
    assert resp.status_code == 422


async def test_list_feedback(client, partner_token):
    resp = await client.get(f"{API}/feedback", headers=auth(partner_token))
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_feedback_detail_for_nonexistent_id_is_404(client, partner_token):
    resp = await client.get(f"{API}/feedback/00000000-0000-0000-0000-000000000000", headers=auth(partner_token))
    assert resp.status_code == 404
