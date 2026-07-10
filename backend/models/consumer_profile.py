import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class ConsumerProfile(Base):
    """Mapping of the shared `consumer_profiles` table (owned by the Consumer
    module). Mostly read here (e.g. to resolve a reviewer's display name for
    GET /reviews) — this app only writes a row when auto-provisioning a
    profile for a first-time booking consumer (see routes/consumer.py)."""

    __tablename__ = "consumer_profiles"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    profile_photo_s3_key: Mapped[str | None] = mapped_column(String)
    preferred_partner_language: Mapped[str | None] = mapped_column(String(10))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
