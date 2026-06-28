from datetime import time as dt_time
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from auth import get_current_partner_id
from models.partner import (
    Partner, BankAccount, PartnerCategory,
    PartnerServiceArea, PartnerAvailability,
)
from schemas.partner import (
    PartnerResponse, UpdatePartnerRequest, OnlineToggle,
    KYCSubmission, BankAccountSchema, ServiceAreaSchema, AvailabilitySchema,
)

router = APIRouter(prefix="/partner", tags=["Partner Profile"])


def _build_partner_response(partner: Partner) -> PartnerResponse:
    return PartnerResponse(
        id=partner.id,
        full_name=partner.full_name,
        phone=partner.phone,
        email=partner.email,
        avatar_url=partner.avatar_url,
        nric=partner.nric,
        is_online=partner.is_online,
        kyc_status=partner.kyc_status,
        rating=float(partner.rating),
        total_jobs=partner.total_jobs,
        completion_rate=float(partner.completion_rate),
        acceptance_rate=float(partner.acceptance_rate),
        experience_years=partner.experience_years,
        bio=partner.bio,
        categories=[pc.category_id for pc in partner.categories],
        service_areas=[
            ServiceAreaSchema(id=sa.id, name=sa.name, zone=sa.zone)
            for sa in partner.service_areas
        ],
        availability=[
            AvailabilitySchema(
                day=a.day_of_week,
                enabled=a.enabled,
                start=a.start_time.strftime("%H:%M") if isinstance(a.start_time, dt_time) else str(a.start_time),
                end=a.end_time.strftime("%H:%M") if isinstance(a.end_time, dt_time) else str(a.end_time),
            )
            for a in partner.availability
        ],
        bank_account=BankAccountSchema(
            bank_name=partner.bank_account.bank_name,
            account_name=partner.bank_account.account_name,
            account_number=partner.bank_account.account_number,
        ) if partner.bank_account else None,
        member_since=partner.member_since,
    )


async def _load_partner(partner_id: UUID, db: AsyncSession) -> Partner:
    stmt = (
        select(Partner)
        .options(
            selectinload(Partner.categories),
            selectinload(Partner.service_areas),
            selectinload(Partner.availability),
            selectinload(Partner.bank_account),
        )
        .where(Partner.id == partner_id)
    )
    partner = (await db.execute(stmt)).scalar_one_or_none()
    if not partner:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Partner not found")
    return partner


@router.get(
    "/me",
    response_model=PartnerResponse,
    summary="Get current partner profile",
    description=(
        "Returns the full profile of the authenticated partner, including personal info, "
        "KYC status, bank account, service categories, service areas, and availability schedule.\n\n"
        "**Database tables:** `partners`, `bank_accounts`, `partner_categories`, `partner_service_areas`, `partner_availability`\n\n"
        "**Permissions:** Requires valid JWT access token (role: partner)"
    ),
    responses={
        200: {"description": "Partner profile returned"},
        401: {"description": "Missing or invalid token", "content": {"application/json": {"example": {"detail": "Invalid or expired token"}}}},
        403: {"description": "Not a partner role", "content": {"application/json": {"example": {"detail": "Insufficient permissions"}}}},
        404: {"description": "Partner profile not found"},
    },
)
async def get_profile(
    partner_id: UUID = Depends(get_current_partner_id),
    db: AsyncSession = Depends(get_db),
):
    partner = await _load_partner(partner_id, db)
    return _build_partner_response(partner)


@router.put(
    "/me",
    response_model=PartnerResponse,
    summary="Update partner profile",
    description=(
        "Updates editable fields of the partner profile: name, email, bio, experience years. "
        "Only fields included in the request body are updated (partial update).\n\n"
        "**Database tables:** `partners`\n\n"
        "**Permissions:** Requires valid JWT access token (role: partner)"
    ),
    responses={
        200: {"description": "Updated profile returned"},
        401: {"description": "Missing or invalid token"},
        422: {"description": "Validation error"},
    },
)
async def update_profile(
    body: UpdatePartnerRequest,
    partner_id: UUID = Depends(get_current_partner_id),
    db: AsyncSession = Depends(get_db),
):
    partner = await _load_partner(partner_id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(partner, field, value)
    await db.flush()
    return _build_partner_response(partner)


@router.put(
    "/me/online",
    summary="Toggle online/offline status",
    description=(
        "Sets the partner's online status. Partner must have verified KYC to go online.\n\n"
        "**Database tables:** `partners`\n\n"
        "**Permissions:** Requires valid JWT access token (role: partner, KYC: verified)"
    ),
    responses={
        200: {
            "description": "Online status updated",
            "content": {"application/json": {"example": {"is_online": True}}},
        },
        403: {"description": "KYC not verified", "content": {"application/json": {"example": {"detail": "KYC not verified"}}}},
    },
)
async def toggle_online(
    body: OnlineToggle,
    partner_id: UUID = Depends(get_current_partner_id),
    db: AsyncSession = Depends(get_db),
):
    partner = await db.get(Partner, partner_id)
    if not partner:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Partner not found")
    if partner.kyc_status != "verified":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "KYC not verified")
    partner.is_online = body.is_online
    await db.flush()
    return {"is_online": partner.is_online}


@router.post(
    "/me/kyc",
    summary="Submit KYC verification",
    description=(
        "Submits all KYC documents and information: personal details (NRIC, experience, bio), "
        "bank account, service categories, service areas, and weekly availability. "
        "Sets KYC status to `pending` for admin review.\n\n"
        "**Database tables:** `partners`, `bank_accounts`, `partner_categories`, "
        "`partner_service_areas`, `partner_availability`\n\n"
        "**Permissions:** Requires valid JWT access token (role: partner)"
    ),
    responses={
        200: {
            "description": "KYC submitted for review",
            "content": {"application/json": {"example": {"kyc_status": "pending"}}},
        },
        401: {"description": "Missing or invalid token"},
        422: {"description": "Validation error (missing required fields)"},
    },
)
async def submit_kyc(
    body: KYCSubmission,
    partner_id: UUID = Depends(get_current_partner_id),
    db: AsyncSession = Depends(get_db),
):
    partner = await _load_partner(partner_id, db)

    partner.nric = body.personal.nric
    partner.experience_years = body.personal.experience_years
    partner.bio = body.personal.bio

    if partner.bank_account:
        partner.bank_account.bank_name = body.bank_account.bank_name
        partner.bank_account.account_name = body.bank_account.account_name
        partner.bank_account.account_number = body.bank_account.account_number
    else:
        db.add(BankAccount(
            partner_id=partner_id,
            bank_name=body.bank_account.bank_name,
            account_name=body.bank_account.account_name,
            account_number=body.bank_account.account_number,
        ))

    await db.execute(delete(PartnerCategory).where(PartnerCategory.partner_id == partner_id))
    for cat_id in body.categories:
        db.add(PartnerCategory(partner_id=partner_id, category_id=cat_id))

    await db.execute(delete(PartnerServiceArea).where(PartnerServiceArea.partner_id == partner_id))
    for area in body.service_areas:
        db.add(PartnerServiceArea(partner_id=partner_id, name=area.name, zone=area.zone))

    await db.execute(delete(PartnerAvailability).where(PartnerAvailability.partner_id == partner_id))
    for slot in body.availability:
        h_start, m_start = slot.start.split(":")
        h_end, m_end = slot.end.split(":")
        db.add(PartnerAvailability(
            partner_id=partner_id,
            day_of_week=slot.day,
            enabled=slot.enabled,
            start_time=dt_time(int(h_start), int(m_start)),
            end_time=dt_time(int(h_end), int(m_end)),
        ))

    partner.kyc_status = "pending"

    await db.flush()
    return {"kyc_status": "pending"}


@router.put(
    "/me/bank-account",
    summary="Update bank account",
    description=(
        "Updates the partner's bank account details for payouts.\n\n"
        "**Database tables:** `bank_accounts`\n\n"
        "**Permissions:** Requires valid JWT access token (role: partner)"
    ),
    responses={
        200: {
            "description": "Bank account updated",
            "content": {"application/json": {"example": {"message": "Bank account updated"}}},
        },
        401: {"description": "Missing or invalid token"},
    },
)
async def update_bank_account(
    body: BankAccountSchema,
    partner_id: UUID = Depends(get_current_partner_id),
    db: AsyncSession = Depends(get_db),
):
    partner = await _load_partner(partner_id, db)
    if partner.bank_account:
        partner.bank_account.bank_name = body.bank_name
        partner.bank_account.account_name = body.account_name
        partner.bank_account.account_number = body.account_number
    else:
        db.add(BankAccount(
            partner_id=partner_id,
            bank_name=body.bank_name,
            account_name=body.account_name,
            account_number=body.account_number,
        ))
    await db.flush()
    return {"message": "Bank account updated"}


@router.put(
    "/me/categories",
    summary="Update service categories",
    description=(
        "Replaces the partner's service categories (e.g., cleaning, ac, plumbing).\n\n"
        "**Database tables:** `partner_categories`\n\n"
        "**Permissions:** Requires valid JWT access token (role: partner)"
    ),
    responses={
        200: {
            "description": "Categories updated",
            "content": {"application/json": {"example": {"categories": ["cleaning", "ac", "plumbing"]}}},
        },
        401: {"description": "Missing or invalid token"},
    },
)
async def update_categories(
    categories: list[str],
    partner_id: UUID = Depends(get_current_partner_id),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(delete(PartnerCategory).where(PartnerCategory.partner_id == partner_id))
    for cat_id in categories:
        db.add(PartnerCategory(partner_id=partner_id, category_id=cat_id))
    await db.flush()
    return {"categories": categories}


@router.put(
    "/me/availability",
    summary="Update weekly availability",
    description=(
        "Replaces the partner's weekly availability schedule. Each slot specifies a day of the week, "
        "whether it's enabled, and start/end times in HH:MM format.\n\n"
        "**Database tables:** `partner_availability`\n\n"
        "**Permissions:** Requires valid JWT access token (role: partner)"
    ),
    responses={
        200: {
            "description": "Availability updated",
            "content": {"application/json": {"example": {"message": "Availability updated"}}},
        },
        401: {"description": "Missing or invalid token"},
        422: {"description": "Validation error"},
    },
)
async def update_availability(
    slots: list[AvailabilitySchema],
    partner_id: UUID = Depends(get_current_partner_id),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(delete(PartnerAvailability).where(PartnerAvailability.partner_id == partner_id))
    for slot in slots:
        h_start, m_start = slot.start.split(":")
        h_end, m_end = slot.end.split(":")
        db.add(PartnerAvailability(
            partner_id=partner_id,
            day_of_week=slot.day,
            enabled=slot.enabled,
            start_time=dt_time(int(h_start), int(m_start)),
            end_time=dt_time(int(h_end), int(m_end)),
        ))
    await db.flush()
    return {"message": "Availability updated"}
