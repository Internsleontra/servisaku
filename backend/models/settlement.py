import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import String, Integer, Numeric, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base
from utils.time import utc_now


class Settlement(Base):
    __tablename__ = "settlements"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    partner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("partners.id", ondelete="CASCADE"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    method: Mapped[str] = mapped_column(String(30), default="DuitNow", nullable=False)
    reference: Mapped[str | None] = mapped_column(String(60))
    jobs_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    items: Mapped[list["SettlementItem"]] = relationship(back_populates="settlement", cascade="all, delete-orphan")


class SettlementItem(Base):
    __tablename__ = "settlement_items"

    settlement_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("settlements.id", ondelete="CASCADE"), primary_key=True)
    earning_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("earnings.id"), primary_key=True)

    settlement: Mapped["Settlement"] = relationship(back_populates="items")
