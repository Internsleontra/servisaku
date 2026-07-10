from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import get_current_partner_id
from models.partner import Partner
from models.review import Review
from models.job import Job
from models.consumer_profile import ConsumerProfile
from schemas.review import ReviewResponse, ReviewsSummaryResponse, RatingDistribution

router = APIRouter(prefix="/reviews", tags=["Reviews"])


@router.get(
    "",
    response_model=list[ReviewResponse],
    summary="Get partner reviews",
    description=(
        "Returns paginated list of customer reviews for the current partner, sorted by most recent first.\n\n"
        "**Database tables:** `reviews`, `consumer_profiles`, `jobs`\n\n"
        "**Permissions:** Requires JWT token (role: partner)"
    ),
    responses={
        200: {"description": "List of reviews with customer info and service details"},
        401: {"description": "Missing or invalid token"},
    },
)
async def get_reviews(
    partner_id: UUID = Depends(get_current_partner_id),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=20, le=100, description="Number of results per page (max 100)"),
    offset: int = Query(default=0, description="Number of results to skip"),
):
    partner = await db.get(Partner, partner_id)

    stmt = (
        select(Review)
        .where(Review.reviewee_id == partner.user_id, Review.reviewer_role == "CONSUMER")
        .order_by(Review.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    reviews = (await db.execute(stmt)).scalars().all()
    if not reviews:
        return []

    # Batch-resolve reviewer display info and the job's service name — Review no
    # longer has direct `customer`/`job` relationships (it FKs to the shared
    # users/bookings tables instead), so these are separate lookups joined here.
    reviewer_ids = [r.reviewer_id for r in reviews]
    booking_ids = [r.booking_id for r in reviews]

    profiles = (await db.execute(
        select(ConsumerProfile).where(ConsumerProfile.user_id.in_(reviewer_ids))
    )).scalars().all()
    profile_by_user = {p.user_id: p for p in profiles}

    jobs = (await db.execute(
        select(Job).where(Job.booking_id.in_(booking_ids))
    )).scalars().all()
    job_by_booking = {j.booking_id: j for j in jobs}

    out = []
    for r in reviews:
        profile = profile_by_user.get(r.reviewer_id)
        job = job_by_booking.get(r.booking_id)
        out.append(ReviewResponse(
            id=r.id,
            job_id=job.id if job else r.booking_id,
            customer_name=profile.full_name if profile else "Customer",
            customer_avatar=profile.profile_photo_s3_key if profile else None,
            service_name=job.service_name if job else "Service",
            rating=r.rating,
            comment=r.review_text,
            tags=list(r.tags.keys()) if isinstance(r.tags, dict) else (r.tags or []),
            date=r.created_at,
        ))
    return out


@router.get(
    "/summary",
    response_model=ReviewsSummaryResponse,
    summary="Get reviews summary",
    description=(
        "Returns aggregate review stats: average rating, total count, and star distribution (5→1).\n\n"
        "**Database tables:** `reviews`\n\n"
        "**Permissions:** Requires JWT token (role: partner)"
    ),
    responses={
        200: {
            "description": "Review summary with rating distribution",
            "content": {"application/json": {"example": {
                "average": 4.5,
                "total": 12,
                "distribution": [
                    {"stars": 5, "count": 8},
                    {"stars": 4, "count": 3},
                    {"stars": 3, "count": 1},
                    {"stars": 2, "count": 0},
                    {"stars": 1, "count": 0},
                ],
            }}},
        },
        401: {"description": "Missing or invalid token"},
    },
)
async def get_reviews_summary(
    partner_id: UUID = Depends(get_current_partner_id),
    db: AsyncSession = Depends(get_db),
):
    partner = await db.get(Partner, partner_id)

    base_where = (Review.reviewee_id == partner.user_id, Review.reviewer_role == "CONSUMER")
    avg_stmt = select(
        func.avg(Review.rating).label("average"),
        func.count().label("total"),
    ).where(*base_where)
    result = (await db.execute(avg_stmt)).one()

    distribution = []
    for stars in range(5, 0, -1):
        count = await db.scalar(
            select(func.count()).where(*base_where, Review.rating == stars)
        )
        distribution.append(RatingDistribution(stars=stars, count=count or 0))

    return ReviewsSummaryResponse(
        average=round(float(result.average or 0), 2),
        total=result.total,
        distribution=distribution,
    )
