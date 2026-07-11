from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from auth import get_current_partner_id, require_verified_kyc
from models.job import Job, JobStatusLog, JobPhoto
from models.earning import Earning
from models.customer import Customer
from schemas.job import JobResponse, JobCustomerSchema, JobLocationSchema, StatusUpdate
from utils.time import utc_now

router = APIRouter(prefix="/jobs", tags=["Jobs"])

UPCOMING_STATUSES = ("accepted", "en_route", "arrived", "in_progress")
VALID_TRANSITIONS = {
    "accepted": ["en_route"],
    "en_route": ["arrived"],
    "arrived": ["in_progress"],
}


def _job_to_response(job: Job) -> JobResponse:
    return JobResponse(
        id=job.id,
        status=job.status,
        category_id=job.category_id,
        service_name=job.service_name,
        package_name=job.package_name,
        addons=job.addons or [],
        customer=JobCustomerSchema(
            name=job.customer.full_name,
            avatar_url=job.customer.avatar_url,
            phone=job.customer.phone,
            rating=float(job.customer.rating),
        ),
        location=JobLocationSchema(
            address_label=job.address_label,
            address_full=job.address_full,
            property_type=job.property_type,
            distance_km=float(job.distance_km) if job.distance_km else None,
            latitude=float(job.latitude) if job.latitude else None,
            longitude=float(job.longitude) if job.longitude else None,
        ),
        scheduled_date=job.scheduled_date,
        time_slot=job.time_slot,
        duration_min=job.duration_min,
        gross_amount=job.gross_amount,
        payout=job.payout,
        notes=job.notes,
        expires_at=job.expires_at,
        completed_at=job.completed_at,
        rating_given=job.rating_given,
        created_at=job.created_at,
    )


async def _get_job(job_id: UUID, partner_id: UUID, db: AsyncSession) -> Job:
    stmt = (
        select(Job)
        .options(selectinload(Job.customer))
        .where(Job.id == job_id, Job.partner_id == partner_id)
    )
    job = (await db.execute(stmt)).scalar_one_or_none()
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    return job


@router.get(
    "/new",
    response_model=list[JobResponse],
    summary="Get new job requests",
    description=(
        "Returns all pending job requests assigned to the current partner that have not expired. "
        "Partners can accept or decline these requests.\n\n"
        "**Database tables:** `jobs`, `customers`\n\n"
        "**Permissions:** Requires JWT token (role: partner, KYC: verified)"
    ),
    responses={
        200: {"description": "List of new job requests"},
        401: {"description": "Missing or invalid token"},
        403: {"description": "KYC verification required"},
    },
)
async def get_new_requests(
    partner_id: UUID = Depends(require_verified_kyc),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Job)
        .options(selectinload(Job.customer))
        .where(Job.partner_id == partner_id, Job.status == "requested")
        .where((Job.expires_at == None) | (Job.expires_at > func.now()))  # noqa: E711
        .order_by(Job.created_at.desc())
    )
    jobs = (await db.execute(stmt)).scalars().all()
    return [_job_to_response(j) for j in jobs]


@router.get(
    "/upcoming",
    response_model=list[JobResponse],
    summary="Get upcoming assigned jobs",
    description=(
        "Returns all jobs in active states: accepted, en_route, arrived, or in_progress. "
        "Sorted by scheduled date ascending.\n\n"
        "**Database tables:** `jobs`, `customers`\n\n"
        "**Permissions:** Requires JWT token (role: partner, KYC: verified)"
    ),
    responses={
        200: {"description": "List of upcoming jobs"},
        401: {"description": "Missing or invalid token"},
        403: {"description": "KYC verification required"},
    },
)
async def get_upcoming(
    partner_id: UUID = Depends(require_verified_kyc),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Job)
        .options(selectinload(Job.customer))
        .where(Job.partner_id == partner_id, Job.status.in_(UPCOMING_STATUSES))
        .order_by(Job.scheduled_date.asc())
    )
    jobs = (await db.execute(stmt)).scalars().all()
    return [_job_to_response(j) for j in jobs]


@router.get(
    "/completed",
    response_model=list[JobResponse],
    summary="Get completed jobs",
    description=(
        "Returns completed jobs with pagination. Sorted by completion date descending.\n\n"
        "**Database tables:** `jobs`, `customers`\n\n"
        "**Permissions:** Requires JWT token (role: partner, KYC: verified)"
    ),
    responses={
        200: {"description": "Paginated list of completed jobs"},
        401: {"description": "Missing or invalid token"},
        403: {"description": "KYC verification required"},
    },
)
async def get_completed(
    partner_id: UUID = Depends(require_verified_kyc),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=20, le=100, description="Number of results per page (max 100)"),
    offset: int = Query(default=0, description="Number of results to skip"),
):
    stmt = (
        select(Job)
        .options(selectinload(Job.customer))
        .where(Job.partner_id == partner_id, Job.status == "completed")
        .order_by(Job.completed_at.desc())
        .limit(limit)
        .offset(offset)
    )
    jobs = (await db.execute(stmt)).scalars().all()
    return [_job_to_response(j) for j in jobs]


@router.get(
    "/today",
    response_model=list[JobResponse],
    summary="Get today's jobs",
    description=(
        "Returns all active jobs scheduled for today.\n\n"
        "**Database tables:** `jobs`, `customers`\n\n"
        "**Permissions:** Requires JWT token (role: partner, KYC: verified)"
    ),
    responses={
        200: {"description": "List of today's jobs"},
        401: {"description": "Missing or invalid token"},
        403: {"description": "KYC verification required"},
    },
)
async def get_today_jobs(
    partner_id: UUID = Depends(require_verified_kyc),
    db: AsyncSession = Depends(get_db),
):
    today = utc_now().date()
    stmt = (
        select(Job)
        .options(selectinload(Job.customer))
        .where(
            Job.partner_id == partner_id,
            Job.status.in_(UPCOMING_STATUSES),
            Job.scheduled_date == today,
        )
    )
    jobs = (await db.execute(stmt)).scalars().all()
    return [_job_to_response(j) for j in jobs]


@router.get(
    "/{job_id}",
    response_model=JobResponse,
    summary="Get job details",
    description=(
        "Returns full details for a specific job by ID.\n\n"
        "**Database tables:** `jobs`, `customers`\n\n"
        "**Permissions:** Requires JWT token (role: partner)"
    ),
    responses={
        200: {"description": "Job details returned"},
        401: {"description": "Missing or invalid token"},
        404: {"description": "Job not found or not owned by partner"},
    },
)
async def get_job_detail(
    job_id: UUID,
    partner_id: UUID = Depends(get_current_partner_id),
    db: AsyncSession = Depends(get_db),
):
    job = await _get_job(job_id, partner_id, db)
    return _job_to_response(job)


@router.post(
    "/{job_id}/accept",
    response_model=JobResponse,
    summary="Accept a job request",
    description=(
        "Accepts a pending job request. The job must be in `requested` status and not expired. "
        "Transitions status to `accepted`.\n\n"
        "**Status transition:** requested → accepted\n\n"
        "**Database tables:** `jobs`, `job_status_log`\n\n"
        "**Permissions:** Requires JWT token (role: partner, KYC: verified)"
    ),
    responses={
        200: {"description": "Job accepted"},
        401: {"description": "Missing or invalid token"},
        403: {"description": "KYC verification required"},
        409: {"description": "Job not in 'requested' state", "content": {"application/json": {"example": {"detail": "Job is no longer in 'requested' state"}}}},
        410: {"description": "Job request expired", "content": {"application/json": {"example": {"detail": "Job request has expired"}}}},
    },
)
async def accept_job(
    job_id: UUID,
    partner_id: UUID = Depends(require_verified_kyc),
    db: AsyncSession = Depends(get_db),
):
    job = await _get_job(job_id, partner_id, db)

    if job.status != "requested":
        raise HTTPException(status.HTTP_409_CONFLICT, "Job is no longer in 'requested' state")
    if job.expires_at and job.expires_at < utc_now():
        raise HTTPException(status.HTTP_410_GONE, "Job request has expired")

    old_status = job.status
    job.status = "accepted"
    db.add(JobStatusLog(
        job_id=job.id, old_status=old_status, new_status="accepted", changed_by=partner_id,
    ))
    await db.flush()
    return _job_to_response(job)


@router.post(
    "/{job_id}/decline",
    summary="Decline a job request",
    description=(
        "Declines a pending job request. Transitions status to `cancelled`.\n\n"
        "**Status transition:** requested → cancelled\n\n"
        "**Database tables:** `jobs`, `job_status_log`\n\n"
        "**Permissions:** Requires JWT token (role: partner, KYC: verified)"
    ),
    responses={
        200: {
            "description": "Job declined",
            "content": {"application/json": {"example": {"id": "uuid-here", "status": "cancelled"}}},
        },
        409: {"description": "Job not in 'requested' state"},
    },
)
async def decline_job(
    job_id: UUID,
    partner_id: UUID = Depends(require_verified_kyc),
    db: AsyncSession = Depends(get_db),
):
    job = await _get_job(job_id, partner_id, db)

    if job.status != "requested":
        raise HTTPException(status.HTTP_409_CONFLICT, "Job is no longer in 'requested' state")

    old_status = job.status
    job.status = "cancelled"
    db.add(JobStatusLog(
        job_id=job.id, old_status=old_status, new_status="cancelled", changed_by=partner_id,
    ))
    await db.flush()
    return {"id": str(job_id), "status": "cancelled"}


@router.put(
    "/{job_id}/status",
    response_model=JobResponse,
    summary="Update job status",
    description=(
        "Advances the job through its status workflow. Only valid transitions are allowed:\n\n"
        "- `accepted` → `en_route`\n"
        "- `en_route` → `arrived`\n"
        "- `arrived` → `in_progress`\n\n"
        "To complete a job, use `POST /{job_id}/complete` instead.\n\n"
        "**Database tables:** `jobs`, `job_status_log`\n\n"
        "**Permissions:** Requires JWT token (role: partner, KYC: verified)"
    ),
    responses={
        200: {"description": "Job status updated"},
        422: {
            "description": "Invalid status transition",
            "content": {"application/json": {"example": {"detail": "Cannot transition from 'accepted' to 'in_progress'"}}},
        },
    },
)
async def update_job_status(
    job_id: UUID,
    body: StatusUpdate,
    partner_id: UUID = Depends(require_verified_kyc),
    db: AsyncSession = Depends(get_db),
):
    job = await _get_job(job_id, partner_id, db)

    allowed = VALID_TRANSITIONS.get(job.status, [])
    if body.status not in allowed:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Cannot transition from '{job.status}' to '{body.status}'",
        )

    old_status = job.status
    job.status = body.status
    db.add(JobStatusLog(
        job_id=job.id, old_status=old_status, new_status=body.status, changed_by=partner_id,
    ))
    await db.flush()
    return _job_to_response(job)


@router.post(
    "/{job_id}/complete",
    response_model=JobResponse,
    summary="Mark job as completed",
    description=(
        "Marks an in-progress job as completed. Creates an earning record with 20% platform fee "
        "and 80% partner payout. The earning is held in escrow initially.\n\n"
        "**Status transition:** in_progress → completed\n\n"
        "**Database tables:** `jobs`, `job_status_log`, `earnings`, `partners`\n\n"
        "**Permissions:** Requires JWT token (role: partner, KYC: verified)"
    ),
    responses={
        200: {"description": "Job completed, earning created"},
        422: {
            "description": "Job not in 'in_progress' state",
            "content": {"application/json": {"example": {"detail": "Job must be in_progress to complete"}}},
        },
    },
)
async def complete_job(
    job_id: UUID,
    partner_id: UUID = Depends(require_verified_kyc),
    db: AsyncSession = Depends(get_db),
):
    job = await _get_job(job_id, partner_id, db)

    if job.status != "in_progress":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Job must be in_progress to complete")

    old_status = job.status
    job.status = "completed"
    job.completed_at = utc_now()

    db.add(JobStatusLog(
        job_id=job.id, old_status=old_status, new_status="completed", changed_by=partner_id,
    ))

    commission = job.gross_amount * Decimal("0.20")
    payout = job.gross_amount * Decimal("0.80")
    db.add(Earning(
        partner_id=partner_id,
        job_id=job.id,
        gross_amount=job.gross_amount,
        commission=commission,
        payout=payout,
        escrow_status="held",
    ))

    from models.partner import Partner
    partner = await db.get(Partner, partner_id)
    if partner:
        partner.total_jobs += 1

    await db.flush()
    return _job_to_response(job)
