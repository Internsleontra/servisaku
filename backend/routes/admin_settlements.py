from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.settlement import Settlement, SettlementItem
from models.earning import Earning
from schemas.admin import SettlementAdminResponse, SettlementCreateRequest, SettlementStatusUpdateRequest
from services.rbac import require_permission, log_admin_action

router = APIRouter(prefix="/admin/settlements", tags=["Admin - Settlements"])

_PERM = "payouts.process"
_VALID_STATUSES = ("pending", "scheduled", "completed")


@router.get(
    "", response_model=list[SettlementAdminResponse], summary="List settlements",
    description="**Database tables:** `settlements`\n\n**Permissions:** Requires JWT token (role: admin, permission: `payouts.process`)",
)
async def list_settlements(
    _admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db),
    status_filter: str | None = Query(default=None, alias="status"),
    partner_id: UUID | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
):
    stmt = select(Settlement).order_by(Settlement.requested_at.desc())
    if status_filter:
        stmt = stmt.where(Settlement.status == status_filter)
    if partner_id:
        stmt = stmt.where(Settlement.partner_id == partner_id)
    stmt = stmt.limit(limit).offset(offset)
    rows = (await db.execute(stmt)).scalars().all()
    return [SettlementAdminResponse.model_validate(r) for r in rows]


@router.get(
    "/{settlement_id}", response_model=SettlementAdminResponse, summary="Get a settlement",
    description="**Database tables:** `settlements`\n\n**Permissions:** Requires JWT token (role: admin, permission: `payouts.process`)",
    responses={404: {"description": "Settlement not found"}},
)
async def get_settlement(settlement_id: UUID, _admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    row = await db.get(Settlement, settlement_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Settlement not found")
    return SettlementAdminResponse.model_validate(row)


@router.post(
    "", response_model=SettlementAdminResponse, status_code=201, summary="Create a settlement for a partner",
    description=(
        "Admin-initiated equivalent of the partner's own `POST /wallet/withdraw` "
        "(Stage 0) — bundles specific `released` earnings into a settlement, "
        "marking them `settled`. Reuses the same `settlements`/`settlement_items` "
        "tables and escrow_status transition, just admin-triggered for specific "
        "earning rows instead of \"withdraw everything available\".\n\n"
        "**Database tables:** `settlements`, `settlement_items`, `earnings`\n\n"
        "**Permissions:** Requires JWT token (role: admin, permission: `payouts.process`)"
    ),
    responses={422: {"description": "One or more earnings are not eligible (not released, or belong to a different partner)"}},
)
async def create_settlement(body: SettlementCreateRequest, admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    earnings = []
    total = 0
    for earning_id in body.earning_ids:
        earning = await db.get(Earning, earning_id)
        if not earning or earning.partner_id != body.partner_id or earning.escrow_status != "released":
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Earning {earning_id} is not an eligible released earning for this partner")
        earnings.append(earning)
        total += earning.payout

    settlement = Settlement(
        partner_id=body.partner_id, amount=total, method="DuitNow",
        reference=f"ADM-{admin_id.hex[:8].upper()}", jobs_count=len(earnings),
    )
    db.add(settlement)
    await db.flush()

    for earning in earnings:
        db.add(SettlementItem(settlement_id=settlement.id, earning_id=earning.id))
        earning.escrow_status = "settled"
        earning.settled_at = datetime.now(timezone.utc)

    await log_admin_action(db, admin_id, "settlement.created", "settlement", settlement.id, f"{len(earnings)} earnings, RM{total}")
    await db.flush()
    return SettlementAdminResponse.model_validate(settlement)


@router.put(
    "/{settlement_id}/status", response_model=SettlementAdminResponse, summary="Update a settlement's status",
    description="**Database tables:** `settlements`\n\n**Permissions:** Requires JWT token (role: admin, permission: `payouts.process`)",
    responses={404: {"description": "Settlement not found"}, 422: {"description": "Invalid status value"}},
)
async def update_settlement_status(
    settlement_id: UUID, body: SettlementStatusUpdateRequest,
    admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db),
):
    if body.status not in _VALID_STATUSES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"status must be one of {_VALID_STATUSES}")
    row = await db.get(Settlement, settlement_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Settlement not found")
    row.status = body.status
    if body.reference:
        row.reference = body.reference
    if body.status == "completed":
        row.completed_at = datetime.now(timezone.utc)
    await log_admin_action(db, admin_id, "settlement.status_updated", "settlement", settlement_id, body.status)
    await db.flush()
    return SettlementAdminResponse.model_validate(row)
