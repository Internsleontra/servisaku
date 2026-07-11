import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, Text, DateTime
from sqlalchemy import Enum as PgEnum
from sqlalchemy.orm import Mapped, mapped_column

from database import Base
from utils.time import utc_now

NOTIFICATION_CHANNEL_VALUES = ("PUSH", "SMS", "EMAIL", "IN_APP")


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(nullable=False)  # FK -> users.id (shared table, not locally mapped)
    booking_id: Mapped[uuid.UUID | None] = mapped_column()  # FK -> bookings.id, nullable
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    # This app doesn't do real push/SMS/email delivery yet (see README "Remaining
    # Modules (Future)") — every notification it creates uses IN_APP.
    channel: Mapped[str] = mapped_column(PgEnum(*NOTIFICATION_CHANNEL_VALUES, name="notification_channel", create_type=False), nullable=False, default="IN_APP")
    notification_type: Mapped[str | None] = mapped_column(String(100))  # old "type": job/payout/rating/system
    reference_type: Mapped[str | None] = mapped_column(String(100))
    reference_id: Mapped[uuid.UUID | None] = mapped_column()
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
