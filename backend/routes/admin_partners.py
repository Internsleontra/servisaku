from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import get_db
from models.partner import Partner, PartnerDocument
from models.auth import User
from schemas.admin import (
    PartnerAdminResponse, PartnerApprovalRequest, PartnerRejectionRequest,
    PartnerSuspendRequest, KYCDocumentReviewRequest, KYCDocumentAdminResponse,
)
from services.rate_limit import limiter
from services.rbac import require_permission, log_admin_action, write_audit_log
from services.notifications.dispatcher import dispatch

router = APIRouter(prefix="/admin/partners", tags=["Admin - Partners"])
settings = get_settings()


def _to_response(partner: Partner, user: User) -> PartnerAdminResponse:
    return PartnerAdminResponse(
        id=partner.id, user_id=partner.user_id, full_name=partner.full_name,
        phone_number=user.phone_number if user else None, email=user.email if user else None,
        status=partner.status, tier=partner.tier, average_rating=float(partner.average_rating or 0),
        completion_rate=float(partner.completion_rate or 0), total_completed_jobs=partner.total_completed_jobs or 0,
        ctos_verified=partner.ctos_verified, created_at=partner.created_at,
        approved_at=partner.approved_at, rejected_at=partner.rejected_at,
    )


@router.get(
    "",
    response_model=list[PartnerAdminResponse],
    summary="List partners",
    description="**Database tables:** `partners`, `users` (read-only)\n\n**Permissions:** Requires JWT token (role: admin, permission: `partners.read`)",
)
async def list_partners(
    _admin_id: UUID = Depends(require_permission("partners.read")),
    db: AsyncSession = Depends(get_db),
    status_filter: str | None = Query(default=None, alias="status", description="DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, ACTIVE, or SUSPENDED"),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
):
    stmt = select(Partner).order_by(Partner.created_at.desc())
    if status_filter:
        stmt = stmt.where(Partner.status == status_filter)
    stmt = stmt.limit(limit).offset(offset)
    partners = (await db.execute(stmt)).scalars().all()
    results = []
    for p in partners:
        user = await db.get(User, p.user_id)
        results.append(_to_response(p, user))
    return results


@router.get(
    "/{partner_id}",
    response_model=PartnerAdminResponse,
    summary="Get a partner",
    description="**Database tables:** `partners`, `users` (read-only)\n\n**Permissions:** Requires JWT token (role: admin, permission: `partners.read`)",
    responses={404: {"description": "Partner not found"}},
)
async def get_partner(
    partner_id: UUID,
    _admin_id: UUID = Depends(require_permission("partners.read")),
    db: AsyncSession = Depends(get_db),
):
    partner = await db.get(Partner, partner_id)
    if not partner:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Partner not found")
    user = await db.get(User, partner.user_id)
    return _to_response(partner, user)


@router.post(
    "/{partner_id}/approve",
    response_model=PartnerAdminResponse,
    summary="Approve a partner application",
    description=(
        "Moves `partners.status` SUBMITTED/UNDER_REVIEW -> APPROVED and sends an "
        "in-app + push notification. There was no admin-approval endpoint before "
        "this stage — status could only ever reach SUBMITTED via the app itself "
        "(see models/partner.py).\n\n"
        "**Database tables:** `partners`, `notifications`, `audit_logs`, `admin_actions`\n\n"
        "**Permissions:** Requires JWT token (role: admin, permission: `partners.approve`)"
    ),
    responses={404: {"description": "Partner not found"}, 409: {"description": "Partner is not awaiting review"}},
)
@limiter.limit(settings.RATE_LIMIT_ADMIN_SENSITIVE)
async def approve_partner(
    request: Request,
    partner_id: UUID,
    body: PartnerApprovalRequest,
    admin_id: UUID = Depends(require_permission("partners.approve")),
    db: AsyncSession = Depends(get_db),
):
    partner = await db.get(Partner, partner_id)
    if not partner:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Partner not found")
    if partner.status not in ("SUBMITTED", "UNDER_REVIEW"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Partner is not awaiting review")

    old_status = partner.status
    partner.status = "ACTIVE"
    partner.approved_at = datetime.now(timezone.utc)
    partner.activated_at = datetime.now(timezone.utc)
    partner.is_available = True

    await dispatch(
        user_id=partner.user_id, category="booking", title="You're approved!",
        body="Your partner application has been approved. You can now start receiving job offers.",
        db=db, channels=("PUSH",),
    )
    await write_audit_log(db, admin_id, "partner", partner_id, "approve", {"status": old_status}, {"status": "ACTIVE", "notes": body.notes})
    await log_admin_action(db, admin_id, "partner.approved", "partner", partner_id, body.notes)
    await db.flush()

    user = await db.get(User, partner.user_id)
    return _to_response(partner, user)


@router.post(
    "/{partner_id}/reject",
    response_model=PartnerAdminResponse,
    summary="Reject a partner application",
    description=(
        "Moves `partners.status` SUBMITTED/UNDER_REVIEW -> REJECTED with a reason "
        "shown to the partner.\n\n"
        "**Database tables:** `partners`, `notifications`, `audit_logs`, `admin_actions`\n\n"
        "**Permissions:** Requires JWT token (role: admin, permission: `partners.reject`)"
    ),
    responses={404: {"description": "Partner not found"}, 409: {"description": "Partner is not awaiting review"}},
)
@limiter.limit(settings.RATE_LIMIT_ADMIN_SENSITIVE)
async def reject_partner(
    request: Request,
    partner_id: UUID,
    body: PartnerRejectionRequest,
    admin_id: UUID = Depends(require_permission("partners.reject")),
    db: AsyncSession = Depends(get_db),
):
    partner = await db.get(Partner, partner_id)
    if not partner:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Partner not found")
    if partner.status not in ("SUBMITTED", "UNDER_REVIEW"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Partner is not awaiting review")

    old_status = partner.status
    partner.status = "REJECTED"
    partner.rejected_at = datetime.now(timezone.utc)
    partner.rejection_reason = body.reason
    if body.reapply_after_days:
        partner.reapply_after = (datetime.now(timezone.utc) + timedelta(days=body.reapply_after_days)).date()

    await dispatch(
        user_id=partner.user_id, category="booking", title="Application update",
        body=f"Your partner application was not approved: {body.reason}", db=db, channels=("PUSH",),
    )
    await write_audit_log(db, admin_id, "partner", partner_id, "reject", {"status": old_status}, {"status": "REJECTED", "reason": body.reason})
    await log_admin_action(db, admin_id, "partner.rejected", "partner", partner_id, body.reason)
    await db.flush()

    user = await db.get(User, partner.user_id)
    return _to_response(partner, user)


@router.post(
    "/{partner_id}/suspend",
    response_model=PartnerAdminResponse,
    summary="Suspend an active partner",
    description=(
        "Moves `partners.status` -> SUSPENDED and takes the partner off dispatch "
        "(`is_available` = false).\n\n"
        "**Database tables:** `partners`, `notifications`, `audit_logs`, `admin_actions`\n\n"
        "**Permissions:** Requires JWT token (role: admin, permission: `partners.suspend`)"
    ),
    responses={404: {"description": "Partner not found"}},
)
@limiter.limit(settings.RATE_LIMIT_ADMIN_SENSITIVE)
async def suspend_partner(
    request: Request,
    partner_id: UUID,
    body: PartnerSuspendRequest,
    admin_id: UUID = Depends(require_permission("partners.suspend")),
    db: AsyncSession = Depends(get_db),
):
    partner = await db.get(Partner, partner_id)
    if not partner:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Partner not found")

    old_status = partner.status
    partner.status = "SUSPENDED"
    partner.is_available = False
    partner.rejection_reason = body.reason

    await dispatch(
        user_id=partner.user_id, category="booking", title="Account suspended",
        body=f"Your partner account has been suspended: {body.reason}", db=db, channels=("PUSH",),
    )
    await write_audit_log(db, admin_id, "partner", partner_id, "suspend", {"status": old_status}, {"status": "SUSPENDED", "reason": body.reason})
    await log_admin_action(db, admin_id, "partner.suspended", "partner", partner_id, body.reason)
    await db.flush()

    user = await db.get(User, partner.user_id)
    return _to_response(partner, user)


@router.post(
    "/{partner_id}/reactivate",
    response_model=PartnerAdminResponse,
    summary="Reactivate a suspended partner",
    description="**Database tables:** `partners`, `audit_logs`, `admin_actions`\n\n**Permissions:** Requires JWT token (role: admin, permission: `partners.suspend`)",
    responses={404: {"description": "Partner not found"}, 409: {"description": "Partner is not suspended"}},
)
@limiter.limit(settings.RATE_LIMIT_ADMIN_SENSITIVE)
async def reactivate_partner(
    request: Request,
    partner_id: UUID,
    admin_id: UUID = Depends(require_permission("partners.suspend")),
    db: AsyncSession = Depends(get_db),
):
    partner = await db.get(Partner, partner_id)
    if not partner:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Partner not found")
    if partner.status != "SUSPENDED":
        raise HTTPException(status.HTTP_409_CONFLICT, "Partner is not suspended")

    partner.status = "ACTIVE"
    partner.is_available = True
    await write_audit_log(db, admin_id, "partner", partner_id, "reactivate", {"status": "SUSPENDED"}, {"status": "ACTIVE"})
    await log_admin_action(db, admin_id, "partner.reactivated", "partner", partner_id, None)
    await db.flush()

    user = await db.get(User, partner.user_id)
    return _to_response(partner, user)


@router.get(
    "/{partner_id}/documents",
    response_model=list[KYCDocumentAdminResponse],
    summary="List a partner's KYC documents",
    description="**Database tables:** `partner_documents`\n\n**Permissions:** Requires JWT token (role: admin, permission: `partners.read`)",
)
async def list_partner_documents(
    partner_id: UUID,
    _admin_id: UUID = Depends(require_permission("partners.read")),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(PartnerDocument).where(PartnerDocument.partner_id == partner_id)
    docs = (await db.execute(stmt)).scalars().all()
    return [
        KYCDocumentAdminResponse(
            id=d.id, partner_id=d.partner_id, document_type=d.document_type, url=d.s3_key,
            verification_status=d.verification_status, rejection_reason=d.rejection_reason,
            uploaded_at=d.uploaded_at, verified_at=d.verified_at,
        ) for d in docs
    ]


@router.post(
    "/documents/{document_id}/verify",
    response_model=KYCDocumentAdminResponse,
    summary="Verify a KYC document",
    description=(
        "Sets `partner_documents.verification_status` -> VERIFIED. There was no "
        "admin-side KYC review endpoint before this stage.\n\n"
        "**Database tables:** `partner_documents`, `audit_logs`, `admin_actions`\n\n"
        "**Permissions:** Requires JWT token (role: admin, permission: `partners.approve`)"
    ),
    responses={404: {"description": "Document not found"}},
)
@limiter.limit(settings.RATE_LIMIT_ADMIN_SENSITIVE)
async def verify_kyc_document(
    request: Request,
    document_id: UUID,
    admin_id: UUID = Depends(require_permission("partners.approve")),
    db: AsyncSession = Depends(get_db),
):
    doc = await db.get(PartnerDocument, document_id)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")

    old_status = doc.verification_status
    doc.verification_status = "VERIFIED"
    doc.verified_by = admin_id
    doc.verified_at = datetime.now(timezone.utc)
    doc.rejection_reason = None

    await write_audit_log(db, admin_id, "partner_document", document_id, "verify", {"verification_status": old_status}, {"verification_status": "VERIFIED"})
    await log_admin_action(db, admin_id, "kyc_document.verified", "partner_document", document_id, None)
    await db.flush()
    return KYCDocumentAdminResponse(
        id=doc.id, partner_id=doc.partner_id, document_type=doc.document_type, url=doc.s3_key,
        verification_status=doc.verification_status, rejection_reason=doc.rejection_reason,
        uploaded_at=doc.uploaded_at, verified_at=doc.verified_at,
    )


@router.post(
    "/documents/{document_id}/reject",
    response_model=KYCDocumentAdminResponse,
    summary="Reject a KYC document",
    description="**Database tables:** `partner_documents`, `audit_logs`, `admin_actions`\n\n**Permissions:** Requires JWT token (role: admin, permission: `partners.reject`)",
    responses={404: {"description": "Document not found"}, 422: {"description": "rejection_reason is required"}},
)
@limiter.limit(settings.RATE_LIMIT_ADMIN_SENSITIVE)
async def reject_kyc_document(
    request: Request,
    document_id: UUID,
    body: KYCDocumentReviewRequest,
    admin_id: UUID = Depends(require_permission("partners.reject")),
    db: AsyncSession = Depends(get_db),
):
    if not body.rejection_reason:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "rejection_reason is required")
    doc = await db.get(PartnerDocument, document_id)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")

    old_status = doc.verification_status
    doc.verification_status = "REJECTED"
    doc.verified_by = admin_id
    doc.verified_at = datetime.now(timezone.utc)
    doc.rejection_reason = body.rejection_reason

    await write_audit_log(db, admin_id, "partner_document", document_id, "reject", {"verification_status": old_status}, {"verification_status": "REJECTED", "reason": body.rejection_reason})
    await log_admin_action(db, admin_id, "kyc_document.rejected", "partner_document", document_id, body.rejection_reason)
    await db.flush()
    return KYCDocumentAdminResponse(
        id=doc.id, partner_id=doc.partner_id, document_type=doc.document_type, url=doc.s3_key,
        verification_status=doc.verification_status, rejection_reason=doc.rejection_reason,
        uploaded_at=doc.uploaded_at, verified_at=doc.verified_at,
    )
