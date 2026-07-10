from datetime import datetime, timezone, date
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import get_current_admin_id
from models.auth import User
from models.partner import Partner
from models.booking import Booking
from models.payment import Payment
from models.settlement import Settlement
from models.dispatch import JobDispatch
from models.support_ticket import OpsTicket
from schemas.admin import DashboardResponse

router = APIRouter(prefix="/admin", tags=["Admin - Dashboard"])


@router.get(
    "/dashboard",
    response_model=DashboardResponse,
    summary="Admin dashboard summary",
    description=(
        "Single aggregate snapshot for the admin home screen: user/partner/booking "
        "counts by status, today's booking volume, captured revenue, pending "
        "settlements, dispatch acceptance rate, and open support ticket counts by "
        "priority. All read-only, all counted live (no cached/materialized view "
        "exists in the current schema — see docs/ADMIN_BACKEND.md).\n\n"
        "**Database tables:** `users`, `partners`, `bookings`, `payments`, "
        "`settlements`, `job_dispatches`, `ops_tickets` (all read-only)\n\n"
        "**Permissions:** Requires JWT token (role: admin)"
    ),
)
async def dashboard(
    _admin_id: UUID = Depends(get_current_admin_id),
    db: AsyncSession = Depends(get_db),
):
    users_by_type = dict((await db.execute(select(User.user_type, func.count()).group_by(User.user_type))).all())
    users_by_status = dict((await db.execute(select(User.status, func.count()).group_by(User.status))).all())

    partners_by_status = dict((await db.execute(select(Partner.status, func.count()).group_by(Partner.status))).all())

    bookings_by_status = dict((await db.execute(select(Booking.booking_status, func.count()).group_by(Booking.booking_status))).all())
    today_bookings = (await db.execute(
        select(func.count()).select_from(Booking).where(Booking.scheduled_date == date.today())
    )).scalar() or 0

    captured_revenue = (await db.execute(
        select(func.coalesce(func.sum(Payment.amount_rm), 0)).where(Payment.status.in_(["CAPTURED", "HELD_IN_ESCROW", "RELEASED"]))
    )).scalar() or 0
    pending_settlements = (await db.execute(
        select(func.coalesce(func.sum(Settlement.amount), 0)).where(Settlement.status == "pending")
    )).scalar() or 0

    dispatch_total = (await db.execute(select(func.count()).select_from(JobDispatch))).scalar() or 0
    dispatch_accepted = (await db.execute(
        select(func.count()).select_from(JobDispatch).where(JobDispatch.status == "ACCEPTED")
    )).scalar() or 0
    dispatch_pending = (await db.execute(
        select(func.count()).select_from(JobDispatch).where(JobDispatch.status == "PENDING")
    )).scalar() or 0

    tickets_by_priority = dict((await db.execute(
        select(OpsTicket.priority, func.count()).where(OpsTicket.status.notin_(["RESOLVED", "CLOSED"])).group_by(OpsTicket.priority)
    )).all())

    return DashboardResponse(
        users={"by_type": users_by_type, "by_status": users_by_status, "total": sum(users_by_type.values())},
        partners={"by_status": partners_by_status, "total": sum(partners_by_status.values())},
        bookings={"by_status": bookings_by_status, "today": today_bookings, "total": sum(bookings_by_status.values())},
        revenue={"captured_rm": float(captured_revenue), "pending_settlements_rm": float(pending_settlements)},
        dispatch={
            "total_offers": dispatch_total,
            "pending_offers": dispatch_pending,
            "acceptance_rate_pct": round(dispatch_accepted / dispatch_total * 100, 2) if dispatch_total else 0.0,
        },
        support={"open_by_priority": tickets_by_priority, "total_open": sum(tickets_by_priority.values())},
        generated_at=datetime.now(timezone.utc),
    )
