from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import get_current_user_id
from models.chat import ChatThread, ChatMessage
from models.consumer_profile import ConsumerProfile
from models.partner import Partner
from schemas.chat import ChatThreadResponse, ChatMessageResponse, SendMessageRequest
from services.realtime import events

router = APIRouter(prefix="/chat", tags=["Chat"])


async def _scope_ids_for_user(user_id: UUID, db: AsyncSession) -> tuple[UUID | None, UUID | None]:
    """Returns (consumer_profile_id, partner_id) — either may be None."""
    consumer_id = (await db.execute(select(ConsumerProfile.id).where(ConsumerProfile.user_id == user_id))).scalar_one_or_none()
    partner_id = (await db.execute(select(Partner.id).where(Partner.user_id == user_id))).scalar_one_or_none()
    return consumer_id, partner_id


async def _get_owned_thread(thread_id: UUID, user_id: UUID, db: AsyncSession) -> ChatThread:
    thread = await db.get(ChatThread, thread_id)
    if not thread:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chat thread not found")
    consumer_id, partner_id = await _scope_ids_for_user(user_id, db)
    if thread.consumer_id != consumer_id and thread.partner_id != partner_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chat thread not found")
    return thread


@router.get(
    "/threads",
    response_model=list[ChatThreadResponse],
    summary="List my chat threads",
    description="Returns every chat thread this consumer/partner is part of.\n\n**Database tables:** `chat_threads`\n\n**Permissions:** Requires JWT token",
)
async def list_threads(user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    consumer_id, partner_id = await _scope_ids_for_user(user_id, db)
    conditions = []
    if consumer_id:
        conditions.append(ChatThread.consumer_id == consumer_id)
    if partner_id:
        conditions.append(ChatThread.partner_id == partner_id)
    if not conditions:
        return []
    stmt = select(ChatThread).where(or_(*conditions)).order_by(ChatThread.created_at.desc())
    rows = (await db.execute(stmt)).scalars().all()
    return [ChatThreadResponse.model_validate(r) for r in rows]


@router.get(
    "/threads/{thread_id}/messages",
    response_model=list[ChatMessageResponse],
    summary="Get message history for a thread",
    description="Returns all messages in a chat thread, oldest first.\n\n**Database tables:** `chat_messages`\n\n**Permissions:** Requires JWT token (consumer/partner in this thread)",
    responses={404: {"description": "Chat thread not found"}},
)
async def get_thread_messages(
    thread_id: UUID, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db),
):
    await _get_owned_thread(thread_id, user_id, db)
    stmt = select(ChatMessage).where(ChatMessage.thread_id == thread_id).order_by(ChatMessage.created_at.asc())
    rows = (await db.execute(stmt)).scalars().all()
    return [ChatMessageResponse.model_validate(r) for r in rows]


@router.post(
    "/threads/{thread_id}/messages",
    response_model=ChatMessageResponse,
    status_code=201,
    summary="Send a chat message (REST fallback)",
    description=(
        "Sends a message in a thread. The primary path is the `chat:send_message` Socket.IO "
        "event (see docs/SOCKET_ARCHITECTURE.md) — this REST endpoint exists as a fallback "
        "and is functionally identical (it emits the same real-time event to the room).\n\n"
        "**Database tables:** `chat_messages`\n\n**Permissions:** Requires JWT token (consumer/partner in this thread)"
    ),
    responses={404: {"description": "Chat thread not found"}},
)
async def send_message(
    thread_id: UUID, body: SendMessageRequest,
    user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db),
):
    thread = await _get_owned_thread(thread_id, user_id, db)
    message = ChatMessage(
        thread_id=thread_id, sender_user_id=user_id,
        message=body.message, attachment_s3_key=body.attachment_s3_key,
    )
    db.add(message)
    await db.flush()

    await events.emit("chat.message", {
        "thread_id": str(thread_id), "booking_id": str(thread.booking_id),
        "message_id": str(message.id), "sender_user_id": str(user_id),
        "message": message.message, "attachment_s3_key": message.attachment_s3_key,
        "created_at": message.created_at.isoformat(),
    })
    return ChatMessageResponse.model_validate(message)


@router.post(
    "/threads/{thread_id}/read",
    summary="Mark all messages in a thread as read (REST fallback)",
    description="Marks every unread message not sent by me as read.\n\n**Database tables:** `chat_messages`\n\n**Permissions:** Requires JWT token (consumer/partner in this thread)",
    responses={404: {"description": "Chat thread not found"}},
)
async def mark_thread_read(
    thread_id: UUID, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db),
):
    await _get_owned_thread(thread_id, user_id, db)
    stmt = select(ChatMessage).where(
        ChatMessage.thread_id == thread_id, ChatMessage.sender_user_id != user_id, ChatMessage.is_read == False,  # noqa: E712
    )
    rows = (await db.execute(stmt)).scalars().all()
    now = datetime.now(timezone.utc)
    for m in rows:
        m.is_read = True
        m.read_at = now
    await db.flush()

    if rows:
        await events.emit("chat.read_receipt", {
            "thread_id": str(thread_id), "reader_user_id": str(user_id),
            "message_ids": [str(m.id) for m in rows],
        })
    return {"marked_read": len(rows)}
