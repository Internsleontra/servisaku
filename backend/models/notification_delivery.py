import uuid
from datetime import datetime

from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy import Enum as PgEnum
from sqlalchemy.orm import Mapped, mapped_column

from database import Base

NOTIFICATION_STATUS_VALUES = ("QUEUED", "SENT", "DELIVERED", "FAILED", "BOUNCED")
DELIVERY_CHANNEL_VALUES = ("PUSH", "SMS", "EMAIL", "IN_APP")


class DeviceToken(Base):
    __tablename__ = "device_tokens"
    __table_args__ = (UniqueConstraint("user_id", "device_token"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    device_token: Mapped[str] = mapped_column(Text, nullable=False)
    device_type: Mapped[str | None] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class NotificationLog(Base):
    __tablename__ = "notification_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    notification_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("notifications.id", ondelete="SET NULL"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    channel: Mapped[str] = mapped_column(PgEnum(*DELIVERY_CHANNEL_VALUES, name="notification_channel", create_type=False), nullable=False)
    provider: Mapped[str | None] = mapped_column(String(100))
    provider_message_id: Mapped[str | None] = mapped_column(String(150))
    status: Mapped[str] = mapped_column(PgEnum(*NOTIFICATION_STATUS_VALUES, name="notification_status", create_type=False), default="QUEUED", nullable=False)
    failure_reason: Mapped[str | None] = mapped_column(Text)
    fallback_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    booking_push: Mapped[bool] = mapped_column(Boolean, default=True)
    booking_sms: Mapped[bool] = mapped_column(Boolean, default=True)
    booking_email: Mapped[bool] = mapped_column(Boolean, default=True)
    payment_push: Mapped[bool] = mapped_column(Boolean, default=True)
    payment_sms: Mapped[bool] = mapped_column(Boolean, default=True)
    payment_email: Mapped[bool] = mapped_column(Boolean, default=True)
    promotional_push: Mapped[bool] = mapped_column(Boolean, default=True)
    promotional_sms: Mapped[bool] = mapped_column(Boolean, default=False)
    promotional_email: Mapped[bool] = mapped_column(Boolean, default=True)
    security_push: Mapped[bool] = mapped_column(Boolean, default=True)
    security_sms: Mapped[bool] = mapped_column(Boolean, default=True)
    security_email: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
