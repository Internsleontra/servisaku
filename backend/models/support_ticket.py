import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import String, Text, Numeric, DateTime, ForeignKey
from sqlalchemy import Enum as PgEnum
from sqlalchemy.orm import Mapped, mapped_column

from database import Base
from utils.time import utc_now

TICKET_TYPE_VALUES = (
    "DISPUTE", "LOW_RATING_FLAG", "PARTNER_NO_SHOW", "CONSUMER_NO_SHOW",
    "CONSUMER_COMPLAINT", "FRAUD_FLAG", "CTOS_REVIEW", "LATE_PARTNER_FLAG", "GENERAL",
)
TICKET_PRIORITY_VALUES = ("LOW", "MEDIUM", "HIGH", "CRITICAL")
TICKET_STATUS_VALUES = ("OPEN", "ASSIGNED", "IN_PROGRESS", "PENDING_CONSUMER", "PENDING_PARTNER", "RESOLVED", "CLOSED")


class OpsTicket(Base):
    """Mapping of the shared `ops_tickets` table (pre-existing, empty) — the
    Support Ticket Dashboard's backing table. Also the target of
    `reviews.ops_ticket_id` (low-rating flags) though this app doesn't write
    that link itself."""

    __tablename__ = "ops_tickets"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    ticket_reference: Mapped[str] = mapped_column(String(30), nullable=False)
    booking_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bookings.id"))
    consumer_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("consumer_profiles.id"))
    partner_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("partners.id"))
    assigned_admin_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    ticket_type: Mapped[str] = mapped_column(PgEnum(*TICKET_TYPE_VALUES, name="ticket_type", create_type=False), nullable=False)
    priority: Mapped[str] = mapped_column(PgEnum(*TICKET_PRIORITY_VALUES, name="ticket_priority", create_type=False), default="MEDIUM")
    status: Mapped[str] = mapped_column(PgEnum(*TICKET_STATUS_VALUES, name="ticket_status", create_type=False), default="OPEN")
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    disputed_amount_rm: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    resolution_notes: Mapped[str | None] = mapped_column(Text)
    sla_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class OpsTicketEvidence(Base):
    """Mapping of the shared `ops_ticket_evidence` table (pre-existing, empty)."""

    __tablename__ = "ops_ticket_evidence"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    ticket_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("ops_tickets.id", ondelete="CASCADE"), nullable=False)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    s3_key: Mapped[str] = mapped_column(String, nullable=False)
    file_type: Mapped[str | None] = mapped_column(String(50))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
