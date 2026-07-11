from datetime import datetime, timedelta
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import require_verified_kyc
from models.earning import Earning
from models.job import Job
from schemas.earning import (
    EarningsResponse, EarningsSummarySchema,
    EarningsPointSchema, EarningsBreakdownItem,
)
from utils.time import utc_now

router = APIRouter(prefix="/earnings", tags=["Earnings"])


def _get_date_range(period: str) -> tuple[datetime, datetime]:
    now = utc_now()
    if period == "daily":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "weekly":
        start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    else:  # monthly
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return start, now


@router.get(
    "",
    response_model=EarningsResponse,
    summary="Get earnings breakdown",
    description=(
        "Returns earnings breakdown for a given period (daily, weekly, or monthly). "
        "Includes summary stats, chart data for visualization, and per-job breakdown.\n\n"
        "**Chart data:**\n"
        "- Daily: hourly buckets (00:00 - 23:00)\n"
        "- Weekly: day-of-week buckets (Mon - Sun)\n"
        "- Monthly: weekly buckets (W1 - W5)\n\n"
        "**Database tables:** `earnings`, `jobs`\n\n"
        "**Permissions:** Requires JWT token (role: partner, KYC: verified)"
    ),
    responses={
        200: {"description": "Earnings breakdown with summary, chart, and per-job details"},
        401: {"description": "Missing or invalid token"},
        403: {"description": "KYC verification required"},
        422: {"description": "Invalid period value"},
    },
)
async def get_earnings(
    period: str = Query(default="daily", pattern=r"^(daily|weekly|monthly)$", description="Time period: daily, weekly, or monthly"),
    partner_id: UUID = Depends(require_verified_kyc),
    db: AsyncSession = Depends(get_db),
):
    start, end = _get_date_range(period)

    stmt = (
        select(Earning, Job.service_name, Job.completed_at)
        .join(Job, Earning.job_id == Job.id)
        .where(Earning.partner_id == partner_id)
        .where(Job.completed_at.between(start, end))
        .order_by(Job.completed_at.desc())
    )
    rows = (await db.execute(stmt)).all()

    total = sum(r.Earning.payout for r in rows)
    tips = sum(r.Earning.tips for r in rows)
    count = len(rows)

    summary = EarningsSummarySchema(
        total=total,
        jobs_completed=count,
        avg_per_job=total / max(count, 1),
        tips=tips,
        change_pct=0.0,
    )

    breakdown = [
        EarningsBreakdownItem(
            job_id=str(r.Earning.job_id),
            service_name=r.service_name,
            date=r.completed_at.isoformat() if r.completed_at else "",
            gross_amount=r.Earning.gross_amount,
            commission=r.Earning.commission,
            payout=r.Earning.payout,
        )
        for r in rows
    ]

    chart: list[EarningsPointSchema] = []
    if period == "daily":
        for hour in range(24):
            label = f"{hour:02d}:00"
            amt = sum(
                r.Earning.payout for r in rows
                if r.completed_at and r.completed_at.hour == hour
            )
            chart.append(EarningsPointSchema(label=label, amount=amt))
    elif period == "weekly":
        day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        for i, name in enumerate(day_names):
            amt = sum(
                r.Earning.payout for r in rows
                if r.completed_at and r.completed_at.weekday() == i
            )
            chart.append(EarningsPointSchema(label=name, amount=amt))
    else:  # monthly
        for week in range(1, 6):
            label = f"W{week}"
            amt = sum(
                r.Earning.payout for r in rows
                if r.completed_at and ((r.completed_at.day - 1) // 7 + 1) == week
            )
            chart.append(EarningsPointSchema(label=label, amount=amt))

    return EarningsResponse(summary=summary, chart=chart, breakdown=breakdown)


@router.get(
    "/summary",
    summary="Get lifetime earnings summary",
    description=(
        "Returns aggregate lifetime earnings: total earned, total tips, total jobs, and average per job.\n\n"
        "**Database tables:** `earnings`\n\n"
        "**Permissions:** Requires JWT token (role: partner, KYC: verified)"
    ),
    responses={
        200: {
            "description": "Lifetime earnings summary",
            "content": {"application/json": {"example": {
                "total_earned": 1250.00,
                "total_tips": 45.00,
                "total_jobs": 15,
                "avg_per_job": 83.33,
            }}},
        },
        401: {"description": "Missing or invalid token"},
        403: {"description": "KYC verification required"},
    },
)
async def get_earnings_summary(
    partner_id: UUID = Depends(require_verified_kyc),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(
        func.sum(Earning.payout).label("total_earned"),
        func.sum(Earning.tips).label("total_tips"),
        func.count().label("total_jobs"),
    ).where(Earning.partner_id == partner_id)
    result = (await db.execute(stmt)).one()

    return {
        "total_earned": float(result.total_earned or 0),
        "total_tips": float(result.total_tips or 0),
        "total_jobs": result.total_jobs or 0,
        "avg_per_job": float((result.total_earned or 0) / max(result.total_jobs or 1, 1)),
    }
