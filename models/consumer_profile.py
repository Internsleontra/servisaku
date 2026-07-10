import uuid

from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class ConsumerProfile(Base):
    """Read-only mapping of the shared `consumer_profiles` table (owned by the
    Consumer module). This app never writes here — only selects, to resolve a
    reviewer's display name/avatar for GET /reviews."""

    __tablename__ = "consumer_profiles"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    profile_photo_s3_key: Mapped[str | None] = mapped_column(String)
