"""Dispatch analytics — aggregate stats computed on-the-fly from
job_dispatches/bookings. No dedicated analytics table: job_dispatches already
retains every offer ever made, so this is a read-only rollup."""

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.dispatch import JobDispatch
from models.booking import Booking


async def get_dispatch_analytics(db: AsyncSession) -> dict:
    total_offers = (await db.execute(select(func.count()).select_from(JobDispatch))).scalar_one()

    status_stmt = select(JobDispatch.status, func.count()).group_by(JobDispatch.status)
    by_status = {row[0]: row[1] for row in (await db.execute(status_stmt)).all()}

    avg_attempts = (await db.execute(
        select(func.avg(Booking.dispatch_attempts)).where(Booking.dispatch_attempts > 0)
    )).scalar_one()

    assigned_stmt = select(func.count()).select_from(Booking).where(Booking.partner_id.isnot(None))
    assigned_bookings = (await db.execute(assigned_stmt)).scalar_one()

    unassigned_after_attempts_stmt = select(func.count()).select_from(Booking).where(
        Booking.partner_id.is_(None), Booking.dispatch_attempts > 0,
    )
    unassigned_after_attempts = (await db.execute(unassigned_after_attempts_stmt)).scalar_one()

    accepted = by_status.get("ACCEPTED", 0)
    acceptance_rate = round((accepted / total_offers) * 100, 2) if total_offers else 0.0

    avg_response_seconds_stmt = select(
        func.avg(func.extract("epoch", JobDispatch.responded_at - JobDispatch.created_at))
    ).where(JobDispatch.responded_at.isnot(None), JobDispatch.status.in_(["ACCEPTED", "DECLINED"]))
    avg_response_seconds = (await db.execute(avg_response_seconds_stmt)).scalar_one()

    per_partner_stmt = select(
        JobDispatch.partner_id,
        func.count().label("offers"),
        func.count().filter(JobDispatch.status == "ACCEPTED").label("accepted"),
    ).group_by(JobDispatch.partner_id).order_by(func.count().desc()).limit(10)
    per_partner_rows = (await db.execute(per_partner_stmt)).all()

    return {
        "total_offers": total_offers,
        "by_status": {
            "PENDING": by_status.get("PENDING", 0),
            "ACCEPTED": by_status.get("ACCEPTED", 0),
            "DECLINED": by_status.get("DECLINED", 0),
            "EXPIRED": by_status.get("EXPIRED", 0),
        },
        "acceptance_rate_pct": acceptance_rate,
        "average_dispatch_attempts_per_booking": round(float(avg_attempts), 2) if avg_attempts else 0.0,
        "average_response_time_seconds": round(float(avg_response_seconds), 1) if avg_response_seconds else None,
        "assigned_bookings": assigned_bookings,
        "unassigned_after_dispatch_attempts": unassigned_after_attempts,
        "top_partners_by_offer_volume": [
            {"partner_id": str(r.partner_id), "offers": r.offers, "accepted": r.accepted}
            for r in per_partner_rows
        ],
    }
