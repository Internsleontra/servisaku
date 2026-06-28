from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from auth import get_current_partner_id
from models.review import Review
from models.customer import Customer
from models.job import Job
from schemas.review import ReviewResponse, ReviewsSummaryResponse, RatingDistribution

router = APIRouter(prefix="/reviews", tags=["Reviews"])


@router.get(
    "",
    response_model=list[ReviewResponse],
    summary="Get partner reviews",
    description=(
        "Returns paginated list of customer reviews for the current partner, sorted by most recent first.\n\n"
        "**Database tables:** `reviews`, `customers`, `jobs`\n\n"
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
    stmt = (
        select(Review)
        .options(selectinload(Review.customer), selectinload(Review.job))
        .where(Review.partner_id == partner_id)
        .order_by(Review.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    reviews = (await db.execute(stmt)).scalars().all()
    return [
        ReviewResponse(
            id=r.id,
            job_id=r.job_id,
            customer_name=r.customer.full_name,
            customer_avatar=r.customer.avatar_url,
            service_name=r.job.service_name,
            rating=r.rating,
            comment=r.comment,
            tags=r.tags or [],
            date=r.created_at,
        )
        for r in reviews
    ]


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
    avg_stmt = select(
        func.avg(Review.rating).label("average"),
        func.count().label("total"),
    ).where(Review.partner_id == partner_id)
    result = (await db.execute(avg_stmt)).one()

    distribution = []
    for stars in range(5, 0, -1):
        count = await db.scalar(
            select(func.count()).where(
                Review.partner_id == partner_id, Review.rating == stars,
            )
        )
        distribution.append(RatingDistribution(stars=stars, count=count or 0))

    return ReviewsSummaryResponse(
        average=round(float(result.average or 0), 2),
        total=result.total,
        distribution=distribution,
    )
