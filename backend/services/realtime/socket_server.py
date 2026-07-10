"""Socket.IO real-time layer — JWT-authenticated, room-based. Mounted onto
the FastAPI ASGI app in main.py (see `socket_app`). Business-logic modules
(dispatch engine, chat routes) never import this module directly; they emit
through services/realtime/events.py, which this module subscribes to on
import — see `_handle_business_event` at the bottom of this file.

Room scheme:
  user:{user_id}       — every connected socket for a given user (any role)
  partner:{partner_id} — a partner's own sockets (used for job-offer push)
  booking:{booking_id} — the consumer + assigned partner for one booking
                         (chat, dispatch updates, booking status, location)
"""

from datetime import datetime, timezone
from uuid import UUID

import socketio
from sqlalchemy import select

from auth import decode_token
from config import get_settings
from database import async_session
from models.booking import Booking
from models.chat import ChatMessage, ChatThread
from models.consumer_profile import ConsumerProfile
from models.partner import Partner
from services.realtime import events
from utils.logging import get_logger

settings = get_settings()
logger = get_logger("socket_server")

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=settings.ALLOWED_ORIGINS if settings.ALLOWED_ORIGINS != ["*"] else "*",
)

# sid -> {user_id, role, consumer_id, partner_id, rooms: set[str], last_seen}
# In-memory only — presence is inherently per-process/ephemeral; there is no
# dedicated presence table in the live schema (see docs/SOCKET_ARCHITECTURE.md).
_sessions: dict[str, dict] = {}


def _user_room(user_id) -> str:
    return f"user:{user_id}"


def _consumer_room(consumer_id) -> str:
    return f"consumer:{consumer_id}"


def _partner_room(partner_id) -> str:
    return f"partner:{partner_id}"


def _booking_room(booking_id) -> str:
    return f"booking:{booking_id}"


@sio.event
async def connect(sid, environ, auth):
    """JWT Socket Authentication — the client must connect with
    `auth={"token": "<access_token>"}`. Rejects the handshake outright on any
    failure rather than allowing an anonymous/unauthenticated socket."""
    token = (auth or {}).get("token")
    if not token:
        raise socketio.exceptions.ConnectionRefusedError("Missing auth token")
    try:
        payload = decode_token(token)
    except Exception:
        raise socketio.exceptions.ConnectionRefusedError("Invalid or expired token")
    if payload.get("type") != "access":
        raise socketio.exceptions.ConnectionRefusedError("Invalid token type")

    user_id = payload["sub"]
    role = payload.get("role")

    consumer_id = None
    partner_id = None
    async with async_session() as db:
        if role == "consumer":
            consumer_id = (await db.execute(
                select(ConsumerProfile.id).where(ConsumerProfile.user_id == user_id)
            )).scalar_one_or_none()
        elif role == "partner":
            partner_id = (await db.execute(
                select(Partner.id).where(Partner.user_id == user_id)
            )).scalar_one_or_none()

    _sessions[sid] = {
        "user_id": user_id, "role": role,
        "consumer_id": str(consumer_id) if consumer_id else None,
        "partner_id": str(partner_id) if partner_id else None,
        "rooms": set(), "last_seen": datetime.now(timezone.utc),
    }
    await sio.enter_room(sid, _user_room(user_id))
    if partner_id:
        await sio.enter_room(sid, _partner_room(partner_id))
    if consumer_id:
        await sio.enter_room(sid, _consumer_room(consumer_id))
    logger.info("socket_connected", sid=sid, user_id=user_id, role=role)


@sio.event
async def disconnect(sid):
    session = _sessions.pop(sid, None)
    if not session:
        return
    for booking_id in session["rooms"]:
        await sio.emit("presence:offline", {"booking_id": booking_id, "role": session["role"]}, room=_booking_room(booking_id))
    logger.info("socket_disconnected", sid=sid, user_id=session.get("user_id"))


@sio.on("booking:join")
async def booking_join(sid, data):
    """Room Management — a client joins a booking's room only after the
    server verifies it's actually the consumer or assigned partner for that
    booking (or an admin)."""
    session = _sessions.get(sid)
    booking_id = (data or {}).get("booking_id")
    if not session or not booking_id:
        return
    async with async_session() as db:
        booking = await db.get(Booking, UUID(booking_id))
    if not booking:
        return
    allowed = (
        session["role"] == "admin"
        or (session["consumer_id"] and str(booking.consumer_id) == session["consumer_id"])
        or (session["partner_id"] and booking.partner_id and str(booking.partner_id) == session["partner_id"])
    )
    if not allowed:
        return
    await sio.enter_room(sid, _booking_room(booking_id))
    session["rooms"].add(booking_id)
    await sio.emit("presence:online", {"booking_id": booking_id, "role": session["role"]}, room=_booking_room(booking_id), skip_sid=sid)


@sio.on("booking:leave")
async def booking_leave(sid, data):
    session = _sessions.get(sid)
    booking_id = (data or {}).get("booking_id")
    if not session or not booking_id:
        return
    await sio.leave_room(sid, _booking_room(booking_id))
    session["rooms"].discard(booking_id)


@sio.on("heartbeat")
async def heartbeat(sid, data=None):
    session = _sessions.get(sid)
    if session:
        session["last_seen"] = datetime.now(timezone.utc)
    await sio.emit("heartbeat:ack", {"server_time": datetime.now(timezone.utc).isoformat()}, room=sid)


@sio.on("chat:typing")
async def chat_typing(sid, data):
    session = _sessions.get(sid)
    booking_id = (data or {}).get("booking_id")
    if not session or not booking_id:
        return
    await sio.emit("chat:typing", {
        "thread_id": data.get("thread_id"), "user_id": session["user_id"],
        "is_typing": bool(data.get("is_typing")),
    }, room=_booking_room(booking_id), skip_sid=sid)


@sio.on("chat:send_message")
async def chat_send_message(sid, data):
    session = _sessions.get(sid)
    thread_id = (data or {}).get("thread_id")
    if not session or not thread_id:
        return

    async with async_session() as db:
        thread = await db.get(ChatThread, UUID(thread_id))
        if not thread:
            return
        allowed = (
            (session["consumer_id"] and str(thread.consumer_id) == session["consumer_id"])
            or (session["partner_id"] and str(thread.partner_id) == session["partner_id"])
        )
        if not allowed:
            return
        message = ChatMessage(
            thread_id=thread.id, sender_user_id=session["user_id"],
            message=data.get("message"), attachment_s3_key=data.get("attachment_s3_key"),
        )
        db.add(message)
        await db.commit()
        await db.refresh(message)
        booking_id = str(thread.booking_id)

    await sio.emit("chat:new_message", {
        "thread_id": thread_id, "booking_id": booking_id, "message_id": str(message.id),
        "sender_user_id": session["user_id"], "message": message.message,
        "attachment_s3_key": message.attachment_s3_key, "created_at": message.created_at.isoformat(),
    }, room=_booking_room(booking_id))


@sio.on("chat:read")
async def chat_read(sid, data):
    session = _sessions.get(sid)
    thread_id = (data or {}).get("thread_id")
    if not session or not thread_id:
        return

    async with async_session() as db:
        thread = await db.get(ChatThread, UUID(thread_id))
        if not thread:
            return
        stmt = select(ChatMessage).where(
            ChatMessage.thread_id == thread.id,
            ChatMessage.sender_user_id != session["user_id"],
            ChatMessage.is_read == False,  # noqa: E712
        )
        rows = (await db.execute(stmt)).scalars().all()
        now = datetime.now(timezone.utc)
        for m in rows:
            m.is_read = True
            m.read_at = now
        await db.commit()
        booking_id = str(thread.booking_id)
        message_ids = [str(m.id) for m in rows]

    if message_ids:
        await sio.emit("chat:read_receipt", {
            "thread_id": thread_id, "reader_user_id": session["user_id"], "message_ids": message_ids,
        }, room=_booking_room(booking_id))


@sio.on("partner:location_update")
async def partner_location_update(sid, data):
    session = _sessions.get(sid)
    if not session or session["role"] != "partner":
        return
    booking_id = (data or {}).get("booking_id")
    lat, lng = (data or {}).get("lat"), (data or {}).get("lng")
    if not booking_id or lat is None or lng is None:
        return
    await sio.emit("partner:location", {
        "booking_id": booking_id, "partner_id": session["partner_id"], "lat": lat, "lng": lng,
    }, room=_booking_room(booking_id), skip_sid=sid)


# --- Business-event bridge --------------------------------------------------
# The single subscriber that maps dispatch/booking/chat business events
# (emitted via services/realtime/events.py, with zero knowledge of Socket.IO)
# onto actual room broadcasts.

async def _handle_business_event(event: str, payload: dict) -> None:
    if event == "dispatch.offer_created":
        await sio.emit("dispatch:job_offer", payload, room=_partner_room(payload["partner_id"]))
    elif event in ("dispatch.assigned", "dispatch.declined", "dispatch.expired", "dispatch.manual_override"):
        booking_id = payload.get("booking_id")
        if booking_id:
            await sio.emit("dispatch:status_update", {"event": event, **payload}, room=_booking_room(booking_id))
    elif event == "dispatch.exhausted":
        # No partner assigned yet, so there's no booking room participant on
        # the partner side — reach the consumer via their own consumer:{id}
        # room instead (payload's consumer_id is consumer_profiles.id, not
        # users.id, so this must be _consumer_room, not _user_room).
        consumer_id = payload.get("consumer_id")
        if consumer_id:
            await sio.emit("dispatch:status_update", {"event": event, **payload}, room=_consumer_room(consumer_id))
    elif event == "booking.status_changed":
        booking_id = payload.get("booking_id")
        if booking_id:
            await sio.emit("booking:status_update", payload, room=_booking_room(booking_id))
    elif event == "chat.message":
        booking_id = payload.get("booking_id")
        if booking_id:
            await sio.emit("chat:new_message", payload, room=_booking_room(booking_id))
    elif event == "chat.read_receipt":
        thread_id = payload.get("thread_id")
        async with async_session() as db:
            thread = await db.get(ChatThread, UUID(thread_id)) if thread_id else None
        if thread:
            await sio.emit("chat:read_receipt", payload, room=_booking_room(str(thread.booking_id)))


events.subscribe(_handle_business_event)


def get_connected_session_count() -> int:
    return len(_sessions)
