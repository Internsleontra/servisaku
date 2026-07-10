import random
import string
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.support_ticket import OpsTicket, OpsTicketEvidence, TICKET_TYPE_VALUES, TICKET_PRIORITY_VALUES
from schemas.support import (
    OpsTicketCreate, OpsTicketUpdate, OpsTicketResponse,
    OpsTicketAssignRequest, OpsTicketResolveRequest, OpsTicketEvidenceResponse,
)
from services.rbac import require_permission, log_admin_action

router = APIRouter(prefix="/admin/support-tickets", tags=["Admin - Support"])

_PERM = "disputes.manage"


def _generate_reference() -> str:
    return "TCK-" + "".join(random.choices(string.digits, k=8))


@router.get(
    "", response_model=list[OpsTicketResponse], summary="Support ticket dashboard — list tickets",
    description="**Database tables:** `ops_tickets`\n\n**Permissions:** Requires JWT token (role: admin, permission: `disputes.manage`)",
)
async def list_tickets(
    _admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db),
    status_filter: str | None = Query(default=None, alias="status"),
    priority: str | None = Query(default=None),
    assigned_admin_id: UUID | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
):
    stmt = select(OpsTicket).order_by(OpsTicket.created_at.desc())
    if status_filter:
        stmt = stmt.where(OpsTicket.status == status_filter)
    if priority:
        stmt = stmt.where(OpsTicket.priority == priority)
    if assigned_admin_id:
        stmt = stmt.where(OpsTicket.assigned_admin_id == assigned_admin_id)
    stmt = stmt.limit(limit).offset(offset)
    rows = (await db.execute(stmt)).scalars().all()
    return [OpsTicketResponse.model_validate(r) for r in rows]


@router.get(
    "/{ticket_id}", response_model=OpsTicketResponse, summary="Get a support ticket",
    description="**Database tables:** `ops_tickets`\n\n**Permissions:** Requires JWT token (role: admin, permission: `disputes.manage`)",
    responses={404: {"description": "Ticket not found"}},
)
async def get_ticket(ticket_id: UUID, _admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    row = await db.get(OpsTicket, ticket_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    return OpsTicketResponse.model_validate(row)


@router.post(
    "", response_model=OpsTicketResponse, status_code=201, summary="Create a support ticket",
    description=(
        f"**Database tables:** `ops_tickets`\n\n"
        "**Permissions:** Requires JWT token (role: admin, permission: `disputes.manage`)"
    ),
    responses={422: {"description": "Invalid ticket_type or priority"}},
)
async def create_ticket(body: OpsTicketCreate, admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    if body.ticket_type not in TICKET_TYPE_VALUES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"ticket_type must be one of {TICKET_TYPE_VALUES}")
    if body.priority not in TICKET_PRIORITY_VALUES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"priority must be one of {TICKET_PRIORITY_VALUES}")

    row = OpsTicket(ticket_reference=_generate_reference(), **body.model_dump())
    db.add(row)
    await log_admin_action(db, admin_id, "support_ticket.created", "ops_ticket", row.id, row.title)
    await db.flush()
    return OpsTicketResponse.model_validate(row)


@router.put(
    "/{ticket_id}", response_model=OpsTicketResponse, summary="Update a support ticket",
    description="**Database tables:** `ops_tickets`\n\n**Permissions:** Requires JWT token (role: admin, permission: `disputes.manage`)",
    responses={404: {"description": "Ticket not found"}},
)
async def update_ticket(ticket_id: UUID, body: OpsTicketUpdate, admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    row = await db.get(OpsTicket, ticket_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await db.flush()
    return OpsTicketResponse.model_validate(row)


@router.post(
    "/{ticket_id}/assign", response_model=OpsTicketResponse, summary="Assign a ticket to an admin",
    description="**Database tables:** `ops_tickets`\n\n**Permissions:** Requires JWT token (role: admin, permission: `disputes.manage`)",
    responses={404: {"description": "Ticket not found"}},
)
async def assign_ticket(ticket_id: UUID, body: OpsTicketAssignRequest, admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    row = await db.get(OpsTicket, ticket_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    row.assigned_admin_id = body.assigned_admin_id
    if row.status == "OPEN":
        row.status = "ASSIGNED"
    await log_admin_action(db, admin_id, "support_ticket.assigned", "ops_ticket", ticket_id, str(body.assigned_admin_id))
    await db.flush()
    return OpsTicketResponse.model_validate(row)


@router.post(
    "/{ticket_id}/resolve", response_model=OpsTicketResponse, summary="Resolve or close a ticket",
    description="**Database tables:** `ops_tickets`\n\n**Permissions:** Requires JWT token (role: admin, permission: `disputes.manage`)",
    responses={404: {"description": "Ticket not found"}, 422: {"description": "Invalid status value"}},
)
async def resolve_ticket(ticket_id: UUID, body: OpsTicketResolveRequest, admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    if body.status not in ("RESOLVED", "CLOSED"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "status must be RESOLVED or CLOSED")
    row = await db.get(OpsTicket, ticket_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    row.status = body.status
    row.resolution_notes = body.resolution_notes
    row.resolved_at = datetime.now(timezone.utc)
    await log_admin_action(db, admin_id, "support_ticket.resolved", "ops_ticket", ticket_id, body.resolution_notes)
    await db.flush()
    return OpsTicketResponse.model_validate(row)


@router.get(
    "/{ticket_id}/evidence", response_model=list[OpsTicketEvidenceResponse], summary="List a ticket's evidence files",
    description="**Database tables:** `ops_ticket_evidence`\n\n**Permissions:** Requires JWT token (role: admin, permission: `disputes.manage`)",
)
async def list_ticket_evidence(ticket_id: UUID, _admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    stmt = select(OpsTicketEvidence).where(OpsTicketEvidence.ticket_id == ticket_id)
    rows = (await db.execute(stmt)).scalars().all()
    return [OpsTicketEvidenceResponse.model_validate(r) for r in rows]
