import uuid as uuid_mod
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import require_verified_kyc
from models.earning import Earning
from models.settlement import Settlement, SettlementItem
from schemas.wallet import WalletBalanceResponse, SettlementResponse
from utils.time import utc_now

router = APIRouter(prefix="/wallet", tags=["Wallet"])


async def _compute_balance(partner_id: UUID, db: AsyncSession) -> dict:
    stmt = select(
        func.coalesce(func.sum(Earning.payout).filter(Earning.escrow_status == "released"), 0).label("available"),
        func.coalesce(func.sum(Earning.payout).filter(Earning.escrow_status == "held"), 0).label("pending"),
        func.coalesce(func.sum(Earning.payout).filter(Earning.escrow_status.in_(["released", "settled"])), 0).label("lifetime"),
    ).where(Earning.partner_id == partner_id)
    result = (await db.execute(stmt)).one()

    withdrawn_stmt = select(
        func.coalesce(func.sum(Settlement.amount), 0)
    ).where(Settlement.partner_id == partner_id, Settlement.status.in_(["pending", "scheduled", "completed"]))
    withdrawn = (await db.execute(withdrawn_stmt)).scalar() or 0

    return {
        "available": float(result.available) - float(withdrawn),
        "pending": float(result.pending),
        "lifetime": float(result.lifetime),
    }


@router.get(
    "/balance",
    response_model=WalletBalanceResponse,
    summary="Get wallet balance",
    description=(
        "Returns the partner's wallet balance breakdown:\n"
        "- **available**: Released earnings minus completed withdrawals\n"
        "- **pending**: Earnings held in escrow (not yet released)\n"
        "- **lifetime**: Total of all released and settled earnings\n\n"
        "**Database tables:** `earnings`, `settlements`\n\n"
        "**Permissions:** Requires JWT token (role: partner, KYC: verified)"
    ),
    responses={
        200: {
            "description": "Wallet balance breakdown",
            "content": {"application/json": {"example": {
                "available": 256.00,
                "pending": 120.00,
                "lifetime": 1250.00,
                "next_payout_date": None,
            }}},
        },
        401: {"description": "Missing or invalid token"},
        403: {"description": "KYC verification required"},
    },
)
async def get_balance(
    partner_id: UUID = Depends(require_verified_kyc),
    db: AsyncSession = Depends(get_db),
):
    balance = await _compute_balance(partner_id, db)
    return WalletBalanceResponse(
        available=Decimal(str(max(balance["available"], 0))),
        pending=Decimal(str(balance["pending"])),
        lifetime=Decimal(str(balance["lifetime"])),
    )


@router.get(
    "/settlements",
    response_model=list[SettlementResponse],
    summary="Get settlement history",
    description=(
        "Returns paginated list of past withdrawal/settlement requests, sorted by most recent first.\n\n"
        "**Database tables:** `settlements`\n\n"
        "**Permissions:** Requires JWT token (role: partner, KYC: verified)"
    ),
    responses={
        200: {"description": "List of settlement records"},
        401: {"description": "Missing or invalid token"},
        403: {"description": "KYC verification required"},
    },
)
async def get_settlements(
    partner_id: UUID = Depends(require_verified_kyc),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=20, le=100, description="Number of results per page (max 100)"),
    offset: int = Query(default=0, description="Number of results to skip"),
):
    stmt = (
        select(Settlement)
        .where(Settlement.partner_id == partner_id)
        .order_by(Settlement.requested_at.desc())
        .limit(limit)
        .offset(offset)
    )
    settlements = (await db.execute(stmt)).scalars().all()
    return [
        SettlementResponse(
            id=s.id,
            amount=s.amount,
            status=s.status,
            method=s.method,
            reference=s.reference,
            jobs_count=s.jobs_count,
            date=s.requested_at,
        )
        for s in settlements
    ]


@router.post(
    "/withdraw",
    response_model=WalletBalanceResponse,
    summary="Request withdrawal",
    description=(
        "Withdraws all available (released) earnings via DuitNow. "
        "Creates a settlement record and marks related earnings as settled.\n\n"
        "**Escrow transition:** released → settled\n\n"
        "**Database tables:** `settlements`, `settlement_items`, `earnings`\n\n"
        "**Permissions:** Requires JWT token (role: partner, KYC: verified)"
    ),
    responses={
        200: {
            "description": "Withdrawal processed, updated balance returned",
            "content": {"application/json": {"example": {
                "available": 0.00,
                "pending": 120.00,
                "lifetime": 1250.00,
                "next_payout_date": None,
            }}},
        },
        401: {"description": "Missing or invalid token"},
        403: {"description": "KYC verification required"},
        422: {
            "description": "No available balance to withdraw",
            "content": {"application/json": {"example": {"detail": "No available balance to withdraw"}}},
        },
    },
)
async def withdraw(
    partner_id: UUID = Depends(require_verified_kyc),
    db: AsyncSession = Depends(get_db),
):
    balance = await _compute_balance(partner_id, db)
    available = balance["available"]

    if available <= 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No available balance to withdraw")

    stmt = (
        select(Earning)
        .where(
            Earning.partner_id == partner_id,
            Earning.escrow_status == "released",
        )
    )
    released_earnings = (await db.execute(stmt)).scalars().all()

    settlement = Settlement(
        partner_id=partner_id,
        amount=Decimal(str(available)),
        method="DuitNow",
        reference=f"SAK-{uuid_mod.uuid4().hex[:12].upper()}",
        jobs_count=len(released_earnings),
    )
    db.add(settlement)
    await db.flush()

    for earning in released_earnings:
        db.add(SettlementItem(settlement_id=settlement.id, earning_id=earning.id))
        earning.escrow_status = "settled"
        earning.settled_at = utc_now()

    await db.flush()

    new_balance = await _compute_balance(partner_id, db)
    return WalletBalanceResponse(
        available=Decimal(str(max(new_balance["available"], 0))),
        pending=Decimal(str(new_balance["pending"])),
        lifetime=Decimal(str(new_balance["lifetime"])),
    )
