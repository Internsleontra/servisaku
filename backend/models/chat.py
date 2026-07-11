import uuid
from datetime import datetime

from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base
from utils.time import utc_now


class ChatThread(Base):
    """Mapping of the shared `chat_threads` table (pre-existing, empty) — one
    thread per booking, created once a partner is assigned (both consumer_id
    and partner_id are NOT NULL live, matching that lifecycle)."""

    __tablename__ = "chat_threads"
    __table_args__ = (UniqueConstraint("booking_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bookings.id"), nullable=False)
    consumer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("consumer_profiles.id"), nullable=False)
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("partners.id"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    messages: Mapped[list["ChatMessage"]] = relationship(back_populates="thread", order_by="ChatMessage.created_at")


class ChatMessage(Base):
    """Mapping of the shared `chat_messages` table (pre-existing, empty).
    sender_user_id references `users.id` directly since both consumer and
    partner identity live there — no separate consumer/partner sender split
    needed."""

    __tablename__ = "chat_messages"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    thread_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("chat_threads.id", ondelete="CASCADE"), nullable=False)
    sender_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    message: Mapped[str | None] = mapped_column(Text)
    attachment_s3_key: Mapped[str | None] = mapped_column(String)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    thread: Mapped["ChatThread"] = relationship(back_populates="messages")
