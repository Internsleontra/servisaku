"""Chat REST fallback API tests (primary path is Socket.IO — see test_socketio.py)."""
from tests.conftest import API, auth


async def test_list_chat_threads_partner(client, partner_token):
    resp = await client.get(f"{API}/chat/threads", headers=auth(partner_token))
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_list_chat_threads_consumer(client, consumer_token):
    resp = await client.get(f"{API}/chat/threads", headers=auth(consumer_token))
    assert resp.status_code == 200


async def test_messages_for_nonexistent_thread_is_404(client, partner_token):
    resp = await client.get(
        f"{API}/chat/threads/00000000-0000-0000-0000-000000000000/messages",
        headers=auth(partner_token),
    )
    assert resp.status_code == 404
