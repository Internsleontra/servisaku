from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.booking import Booking
from models.payment import Payment, Refund
from models.partner import Partner
from models.auth import User
from models.consumer_profile import ConsumerProfile
from models.catalog import Service, ServiceCategory
from models.notification_delivery import NotificationLog
from models.support_ticket import OpsTicket
from schemas.analytics import (
    RevenueAnalyticsResponse, BookingAnalyticsResponse, PartnerPerformanceResponse,
    ConsumerAnalyticsResponse, TrendMetricsResponse, ConversionAnalyticsResponse,
    CancellationAnalyticsResponse, PaymentAnalyticsResponse,
    NotificationAnalyticsResponse, SupportAnalyticsResponse,
)
from services.dispatch.analytics import get_dispatch_analytics
from services.rbac import require_permission

router = APIRouter(prefix="/admin/analytics", tags=["Admin - Analytics"])

_PERM = "reports.read"
_CANCELLED_STATUSES = ("CANCELLED_BY_CONSUMER", "CANCELLED_BY_PARTNER", "CONSUMER_NO_SHOW", "PARTNER_NO_SHOW")


def _window_start(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


@router.get(
    "/revenue", response_model=RevenueAnalyticsResponse, summary="Revenue analytics",
    description=(
        "Captured/refunded/net revenue over a rolling window, broken down by day "
        "and by service category. No materialized view exists for this in the "
        "live schema (checked before writing this) — computed live from `payments`/`refunds`.\n\n"
        "**Database tables:** `payments`, `refunds`, `bookings`, `services`, `service_categories` (read-only)\n\n"
        "**Permissions:** Requires JWT token (role: admin, permission: `reports.read`)"
    ),
)
async def revenue_analytics(
    _admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db),
    days: int = Query(default=30, le=365),
):
    since = _window_start(days)
    captured = (await db.execute(
        select(func.coalesce(func.sum(Payment.amount_rm), 0)).where(Payment.status.in_(["CAPTURED", "HELD_IN_ESCROW", "RELEASED"]))
    )).scalar() or 0
    refunded = (await db.execute(
        select(func.coalesce(func.sum(Refund.amount_rm), 0)).where(Refund.status == "COMPLETED")
    )).scalar() or 0

    by_day_rows = (await db.execute(text(
        """
        SELECT date_trunc('day', created_at)::date AS day, COALESCE(SUM(amount_rm), 0) AS captured_rm
        FROM payments
        WHERE status IN ('CAPTURED', 'HELD_IN_ESCROW', 'RELEASED') AND created_at >= :since
        GROUP BY 1 ORDER BY 1
        """
    ), {"since": since})).all()
    by_day = [{"date": str(r.day), "captured_rm": float(r.captured_rm)} for r in by_day_rows]

    by_category_rows = (await db.execute(text(
        """
        SELECT sc.name AS category, COALESCE(SUM(p.amount_rm), 0) AS captured_rm
        FROM payments p
        JOIN bookings b ON b.id = p.booking_id
        JOIN services s ON s.id = b.service_id
        JOIN service_categories sc ON sc.id = s.category_id
        WHERE p.status IN ('CAPTURED', 'HELD_IN_ESCROW', 'RELEASED')
        GROUP BY sc.name ORDER BY captured_rm DESC
        """
    ))).all()
    by_category = [{"category": r.category, "captured_rm": float(r.captured_rm)} for r in by_category_rows]

    return RevenueAnalyticsResponse(
        total_captured_rm=float(captured), total_refunded_rm=float(refunded),
        net_revenue_rm=float(captured) - float(refunded),
        by_day=by_day, by_service_category=by_category, generated_at=datetime.now(timezone.utc),
    )


@router.get(
    "/bookings", response_model=BookingAnalyticsResponse, summary="Booking analytics",
    description="**Database tables:** `bookings`, `services`, `service_categories` (read-only)\n\n**Permissions:** Requires JWT token (role: admin, permission: `reports.read`)",
)
async def booking_analytics(
    _admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db),
    days: int = Query(default=30, le=365),
):
    since = _window_start(days)
    by_status = dict((await db.execute(select(Booking.booking_status, func.count()).group_by(Booking.booking_status))).all())
    total = sum(by_status.values())

    by_day_rows = (await db.execute(text(
        "SELECT date_trunc('day', created_at)::date AS day, COUNT(*) AS n FROM bookings WHERE created_at >= :since GROUP BY 1 ORDER BY 1"
    ), {"since": since})).all()
    by_day = [{"date": str(r.day), "count": r.n} for r in by_day_rows]

    by_category_rows = (await db.execute(text(
        """
        SELECT sc.name AS category, COUNT(*) AS n
        FROM bookings b JOIN services s ON s.id = b.service_id JOIN service_categories sc ON sc.id = s.category_id
        GROUP BY sc.name ORDER BY n DESC
        """
    ))).all()
    by_category = [{"category": r.category, "count": r.n} for r in by_category_rows]

    avg_value = (await db.execute(select(func.coalesce(func.avg(Booking.total_amount_rm), 0)))).scalar() or 0

    return BookingAnalyticsResponse(
        total_bookings=total, by_status=by_status, by_day=by_day, by_service_category=by_category,
        average_booking_value_rm=float(avg_value), generated_at=datetime.now(timezone.utc),
    )


@router.get(
    "/partners", response_model=PartnerPerformanceResponse, summary="Partner performance analytics",
    description="**Database tables:** `partners` (read-only)\n\n**Permissions:** Requires JWT token (role: admin, permission: `reports.read`)",
)
async def partner_performance(
    _admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db),
    limit: int = Query(default=10, le=50),
):
    top_jobs = (await db.execute(
        select(Partner.id, Partner.full_name, Partner.total_completed_jobs)
        .order_by(Partner.total_completed_jobs.desc()).limit(limit)
    )).all()
    top_rating = (await db.execute(
        select(Partner.id, Partner.full_name, Partner.average_rating, Partner.rating_count)
        .where(Partner.rating_count > 0).order_by(Partner.average_rating.desc()).limit(limit)
    )).all()
    top_completion = (await db.execute(
        select(Partner.id, Partner.full_name, Partner.completion_rate)
        .order_by(Partner.completion_rate.desc()).limit(limit)
    )).all()
    avg_rating = (await db.execute(select(func.coalesce(func.avg(Partner.average_rating), 0)).where(Partner.rating_count > 0))).scalar() or 0
    avg_completion = (await db.execute(select(func.coalesce(func.avg(Partner.completion_rate), 0)))).scalar() or 0
    active_count = (await db.execute(select(func.count()).select_from(Partner).where(Partner.status == "ACTIVE"))).scalar() or 0

    return PartnerPerformanceResponse(
        top_by_completed_jobs=[{"partner_id": str(r.id), "full_name": r.full_name, "completed_jobs": r.total_completed_jobs} for r in top_jobs],
        top_by_rating=[{"partner_id": str(r.id), "full_name": r.full_name, "average_rating": float(r.average_rating), "rating_count": r.rating_count} for r in top_rating],
        top_by_completion_rate=[{"partner_id": str(r.id), "full_name": r.full_name, "completion_rate": float(r.completion_rate)} for r in top_completion],
        average_rating_platform_wide=float(avg_rating), average_completion_rate_platform_wide=float(avg_completion),
        active_partner_count=active_count, generated_at=datetime.now(timezone.utc),
    )


@router.get(
    "/consumers", response_model=ConsumerAnalyticsResponse, summary="Consumer analytics",
    description="**Database tables:** `consumer_profiles`, `users`, `bookings` (read-only)\n\n**Permissions:** Requires JWT token (role: admin, permission: `reports.read`)",
)
async def consumer_analytics(
    _admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db),
    days: int = Query(default=30, le=365),
    limit: int = Query(default=10, le=50),
):
    since = _window_start(days)
    total = (await db.execute(select(func.count()).select_from(ConsumerProfile))).scalar() or 0

    new_rows = (await db.execute(text(
        "SELECT date_trunc('day', created_at)::date AS day, COUNT(*) AS n FROM consumer_profiles WHERE created_at >= :since GROUP BY 1 ORDER BY 1"
    ), {"since": since})).all()
    new_by_day = [{"date": str(r.day), "count": r.n} for r in new_rows]

    booking_counts = (await db.execute(
        select(Booking.consumer_id, func.count()).group_by(Booking.consumer_id)
    )).all()
    repeaters = sum(1 for _, c in booking_counts if c > 1)
    repeat_rate = (repeaters / len(booking_counts) * 100) if booking_counts else 0.0

    top_spend_rows = (await db.execute(text(
        """
        SELECT cp.id AS consumer_id, cp.full_name, COALESCE(SUM(b.total_amount_rm), 0) AS spend_rm
        FROM consumer_profiles cp JOIN bookings b ON b.consumer_id = cp.id
        WHERE b.booking_status NOT IN ('PENDING_PAYMENT')
        GROUP BY cp.id, cp.full_name ORDER BY spend_rm DESC LIMIT :limit
        """
    ), {"limit": limit})).all()
    top_spend = [{"consumer_id": str(r.consumer_id), "full_name": r.full_name, "spend_rm": float(r.spend_rm)} for r in top_spend_rows]

    return ConsumerAnalyticsResponse(
        total_consumers=total, new_consumers_by_day=new_by_day, repeat_booking_rate_pct=round(repeat_rate, 2),
        top_consumers_by_spend=top_spend, generated_at=datetime.now(timezone.utc),
    )


@router.get(
    "/trends", response_model=TrendMetricsResponse, summary="Dashboard trend metrics (time series)",
    description=(
        "Time-series companion to `GET /admin/dashboard`'s point-in-time snapshot "
        "(Stage 6) — bookings/revenue/new-user counts per day over a rolling "
        "window, ready for a dashboard line chart.\n\n"
        "**Database tables:** `bookings`, `payments`, `users` (read-only)\n\n"
        "**Permissions:** Requires JWT token (role: admin, permission: `reports.read`)"
    ),
)
async def trend_metrics(
    _admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db),
    days: int = Query(default=30, le=365),
):
    since = _window_start(days)
    bookings_rows = (await db.execute(text(
        "SELECT date_trunc('day', created_at)::date AS day, COUNT(*) AS n FROM bookings WHERE created_at >= :since GROUP BY 1 ORDER BY 1"
    ), {"since": since})).all()
    revenue_rows = (await db.execute(text(
        "SELECT date_trunc('day', created_at)::date AS day, COALESCE(SUM(amount_rm),0) AS rm FROM payments WHERE status IN ('CAPTURED','HELD_IN_ESCROW','RELEASED') AND created_at >= :since GROUP BY 1 ORDER BY 1"
    ), {"since": since})).all()
    users_rows = (await db.execute(text(
        "SELECT date_trunc('day', created_at)::date AS day, COUNT(*) AS n FROM users WHERE created_at >= :since GROUP BY 1 ORDER BY 1"
    ), {"since": since})).all()

    return TrendMetricsResponse(
        window_days=days,
        bookings_by_day=[{"date": str(r.day), "count": r.n} for r in bookings_rows],
        revenue_by_day=[{"date": str(r.day), "revenue_rm": float(r.rm)} for r in revenue_rows],
        new_users_by_day=[{"date": str(r.day), "count": r.n} for r in users_rows],
        generated_at=datetime.now(timezone.utc),
    )


@router.get(
    "/conversion", response_model=ConversionAnalyticsResponse, summary="Booking funnel conversion analytics",
    description="**Database tables:** `bookings` (read-only)\n\n**Permissions:** Requires JWT token (role: admin, permission: `reports.read`)",
)
async def conversion_analytics(
    _admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db),
):
    total = (await db.execute(select(func.count()).select_from(Booking))).scalar() or 0
    confirmed_or_beyond = (await db.execute(
        select(func.count()).select_from(Booking).where(Booking.booking_status != "PENDING_PAYMENT")
    )).scalar() or 0
    assigned_or_beyond = (await db.execute(
        select(func.count()).select_from(Booking).where(Booking.booking_status.notin_(["PENDING_PAYMENT", "CONFIRMED"]))
    )).scalar() or 0
    completed = (await db.execute(
        select(func.count()).select_from(Booking).where(Booking.booking_status == "COMPLETED")
    )).scalar() or 0

    return ConversionAnalyticsResponse(
        total_created=total, reached_confirmed=confirmed_or_beyond, reached_partner_assigned=assigned_or_beyond,
        reached_completed=completed,
        pending_payment_to_confirmed_pct=round(confirmed_or_beyond / total * 100, 2) if total else 0.0,
        confirmed_to_completed_pct=round(completed / confirmed_or_beyond * 100, 2) if confirmed_or_beyond else 0.0,
        overall_conversion_pct=round(completed / total * 100, 2) if total else 0.0,
        generated_at=datetime.now(timezone.utc),
    )


@router.get(
    "/cancellations", response_model=CancellationAnalyticsResponse, summary="Cancellation reports",
    description="**Database tables:** `bookings` (read-only)\n\n**Permissions:** Requires JWT token (role: admin, permission: `reports.read`)",
)
async def cancellation_analytics(
    _admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db),
):
    total = (await db.execute(select(func.count()).select_from(Booking))).scalar() or 0
    by_status = dict((await db.execute(
        select(Booking.booking_status, func.count()).where(Booking.booking_status.in_(_CANCELLED_STATUSES)).group_by(Booking.booking_status)
    )).all())
    total_cancelled = sum(by_status.values())
    no_show = by_status.get("CONSUMER_NO_SHOW", 0) + by_status.get("PARTNER_NO_SHOW", 0)

    return CancellationAnalyticsResponse(
        total_cancelled=total_cancelled, by_reason_status=by_status,
        cancellation_rate_pct=round(total_cancelled / total * 100, 2) if total else 0.0,
        no_show_count=no_show, generated_at=datetime.now(timezone.utc),
    )


@router.get(
    "/dispatch", summary="Dispatch analytics",
    description=(
        "Alias for the existing `GET /dispatch/analytics` (Stage 4) — not "
        "duplicated, just re-exposed under the analytics namespace for a "
        "single dashboard integration point.\n\n"
        "**Permissions:** Requires JWT token (role: admin, permission: `reports.read`)"
    ),
)
async def dispatch_analytics_alias(
    _admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db),
):
    return await get_dispatch_analytics(db)


@router.get(
    "/payments", response_model=PaymentAnalyticsResponse, summary="Payment analytics",
    description="**Database tables:** `payments`, `refunds` (read-only)\n\n**Permissions:** Requires JWT token (role: admin, permission: `reports.read`)",
)
async def payment_analytics(
    _admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db),
):
    by_status = dict((await db.execute(select(Payment.status, func.count()).group_by(Payment.status))).all())
    by_gateway = dict((await db.execute(select(Payment.payment_gateway, func.count()).group_by(Payment.payment_gateway))).all())
    by_method = dict((await db.execute(select(Payment.payment_method, func.count()).group_by(Payment.payment_method))).all())
    total_payments = sum(by_status.values())
    successful = sum(v for k, v in by_status.items() if k in ("CAPTURED", "HELD_IN_ESCROW", "RELEASED", "REFUNDED", "PARTIALLY_REFUNDED"))

    refund_by_status = dict((await db.execute(select(Refund.status, func.count()).group_by(Refund.status))).all())
    total_refund_requests = sum(refund_by_status.values())
    approved_or_beyond = sum(v for k, v in refund_by_status.items() if k in ("APPROVED", "PROCESSING", "COMPLETED"))

    return PaymentAnalyticsResponse(
        by_status=by_status, by_gateway=by_gateway, by_method=by_method,
        success_rate_pct=round(successful / total_payments * 100, 2) if total_payments else 0.0,
        total_refund_requests=total_refund_requests,
        refund_approval_rate_pct=round(approved_or_beyond / total_refund_requests * 100, 2) if total_refund_requests else 0.0,
        generated_at=datetime.now(timezone.utc),
    )


@router.get(
    "/notifications", response_model=NotificationAnalyticsResponse, summary="Notification delivery analytics",
    description="**Database tables:** `notification_logs` (read-only)\n\n**Permissions:** Requires JWT token (role: admin, permission: `reports.read`)",
)
async def notification_analytics(
    _admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db),
):
    by_channel = dict((await db.execute(select(NotificationLog.channel, func.count()).group_by(NotificationLog.channel))).all())
    by_status = dict((await db.execute(select(NotificationLog.status, func.count()).group_by(NotificationLog.status))).all())
    total = sum(by_status.values())
    delivered = by_status.get("SENT", 0) + by_status.get("DELIVERED", 0)

    provider_rows = (await db.execute(
        select(NotificationLog.provider, func.count()).where(NotificationLog.provider.is_not(None)).group_by(NotificationLog.provider)
    )).all()
    by_provider = {p or "unknown": c for p, c in provider_rows}

    return NotificationAnalyticsResponse(
        by_channel=by_channel, by_status=by_status,
        delivery_success_rate_pct=round(delivered / total * 100, 2) if total else 0.0,
        by_provider=by_provider, generated_at=datetime.now(timezone.utc),
    )


@router.get(
    "/support", response_model=SupportAnalyticsResponse, summary="Support ticket analytics",
    description="**Database tables:** `ops_tickets` (read-only)\n\n**Permissions:** Requires JWT token (role: admin, permission: `reports.read`)",
)
async def support_analytics(
    _admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db),
):
    by_type = dict((await db.execute(select(OpsTicket.ticket_type, func.count()).group_by(OpsTicket.ticket_type))).all())
    by_priority = dict((await db.execute(select(OpsTicket.priority, func.count()).group_by(OpsTicket.priority))).all())
    by_status = dict((await db.execute(select(OpsTicket.status, func.count()).group_by(OpsTicket.status))).all())
    total = sum(by_status.values())

    avg_resolution_seconds = (await db.execute(text(
        "SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) FROM ops_tickets WHERE resolved_at IS NOT NULL"
    ))).scalar()
    avg_hours = float(avg_resolution_seconds) / 3600 if avg_resolution_seconds is not None else None

    sla_breaches = (await db.execute(
        select(func.count()).select_from(OpsTicket).where(
            OpsTicket.sla_due_at.is_not(None),
            OpsTicket.status.notin_(["RESOLVED", "CLOSED"]),
            OpsTicket.sla_due_at < datetime.now(timezone.utc),
        )
    )).scalar() or 0

    return SupportAnalyticsResponse(
        total_tickets=total, by_type=by_type, by_priority=by_priority, by_status=by_status,
        average_resolution_hours=round(avg_hours, 2) if avg_hours is not None else None,
        sla_breach_count=sla_breaches, generated_at=datetime.now(timezone.utc),
    )
