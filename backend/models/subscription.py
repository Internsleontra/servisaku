import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import String, Boolean, Numeric, DateTime, ForeignKey
from sqlalchemy import Enum as PgEnum
from sqlalchemy.orm import Mapped, mapped_column

from database import Base

# Design decision (see docs/ADMIN_BACKEND.md "Package CRUD" section): the live
# schema has no dedicated "packages" catalog table. `subscriptions` — a
# consumer's membership plan (PLUS_MONTHLY/PLUS_ANNUAL/B2B), a fixed 3-value
# enum, not an admin-creatable row type — is the closest real analog and is
# what routes/admin_catalog.py exposes as package/plan management: list/view/
# cancel/reactivate an individual subscription. There is nothing to "create"
# beyond a new subscription instance for a user (plan tiers themselves are
# not rows you can add to).
SUBSCRIPTION_PLAN_VALUES = ("PLUS_MONTHLY", "PLUS_ANNUAL", "B2B")
SUBSCRIPTION_STATUS_VALUES = ("ACTIVE", "CANCELLED", "EXPIRED", "PAST_DUE")


class Subscription(Base):
    """Mapping of the shared `subscriptions` table (pre-existing, empty)."""

    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    plan: Mapped[str] = mapped_column(PgEnum(*SUBSCRIPTION_PLAN_VALUES, name="subscription_plan", create_type=False), nullable=False)
    amount_rm: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    status: Mapped[str] = mapped_column(PgEnum(*SUBSCRIPTION_STATUS_VALUES, name="subscription_status", create_type=False), default="ACTIVE")
    auto_renew: Mapped[bool] = mapped_column(Boolean, default=True)
    payment_method_ref: Mapped[str | None] = mapped_column(String(100))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    renewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
