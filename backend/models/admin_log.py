import uuid
from datetime import datetime

from sqlalchemy import String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column

from database import Base
from utils.time import utc_now


class AdminAction(Base):
    """Mapping of the shared `admin_actions` table (pre-existing, empty) — a
    lightweight one-line-per-action log of every admin mutation, distinct
    from the more detailed `audit_logs` (which carries before/after values).
    Written by services/rbac.py::log_admin_action, called from every mutating
    admin endpoint added in this stage."""

    __tablename__ = "admin_actions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    admin_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    action_type: Mapped[str] = mapped_column(String(100), nullable=False)
    target_type: Mapped[str | None] = mapped_column(String(50))
    target_id: Mapped[uuid.UUID | None] = mapped_column()
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class AuditLog(Base):
    """Mapping of the shared `audit_logs` table (pre-existing, empty) —
    structured before/after change tracking for sensitive mutations (partner
    approval, coupon/pricing changes, refund decisions, user suspension).
    Written by services/rbac.py::write_audit_log.

    `retention_until` (live column: `date GENERATED ALWAYS AS
    ((created_at AT TIME ZONE 'UTC')::date + '7 years'::interval) STORED`)
    is intentionally left unmapped — Postgres rejects any explicit value
    (including NULL) in the INSERT column list for a GENERATED ALWAYS
    column, and this app never needs to read it back."""

    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[uuid.UUID | None] = mapped_column()
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    old_values: Mapped[dict | None] = mapped_column(JSON)
    new_values: Mapped[dict | None] = mapped_column(JSON)
    ip_address: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
