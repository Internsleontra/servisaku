import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, Integer, DateTime
from sqlalchemy import Enum as PgEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base

# Mirrors the shared `user_type` / `account_status` Postgres enums already defined
# in servisakudb — create_type=False so SQLAlchemy never tries to (re)create them.
USER_TYPE_VALUES = ("CONSUMER", "PARTNER", "ADMIN")
ACCOUNT_STATUS_VALUES = ("ACTIVE", "INACTIVE", "SUSPENDED", "LOCKED", "PENDING_VERIFICATION", "DELETED")


class User(Base):
    """Shared team identity table. Central across all modules (consumer, partner, admin)."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_type: Mapped[str] = mapped_column(PgEnum(*USER_TYPE_VALUES, name="user_type", create_type=False), nullable=False)
    phone_number: Mapped[str | None] = mapped_column(String(20), unique=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str | None] = mapped_column(String)
    is_phone_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(
        PgEnum(*ACCOUNT_STATUS_VALUES, name="account_status", create_type=False),
        default="PENDING_VERIFICATION", nullable=False,
    )
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    partner: Mapped["Partner | None"] = relationship(back_populates="user", uselist=False)


from models.partner import Partner  # noqa: E402, F811
