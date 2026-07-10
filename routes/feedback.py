from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import get_current_partner_id
from models.feedback import Feedback
from models.partner import Partner
from models.auth import User
from schemas.feedback import FeedbackRequest, FeedbackResponse
from services.notifications.dispatcher import dispatch_standalone

router = APIRouter(prefix="/feedback", tags=["Feedback & Support"])


@router.post(
    "",
    status_code=201,
    response_model=FeedbackResponse,
    summary="Submit feedback or bug report",
    description=(
        "Submits a feedback entry (general, bug, feature request, or complaint). "
        "Optionally attach a screenshot URL.\n\n"
        "**Database tables:** `feedback`\n\n"
        "**Permissions:** Requires JWT token (role: partner)"
    ),
    responses={
        201: {"description": "Feedback submitted"},
        401: {"description": "Missing or invalid token"},
        422: {"description": "Validation error (invalid type, subject too short, etc.)"},
    },
)
async def submit_feedback(
    body: FeedbackRequest,
    background_tasks: BackgroundTasks,
    partner_id: UUID = Depends(get_current_partner_id),
    db: AsyncSession = Depends(get_db),
):
    fb = Feedback(
        partner_id=partner_id,
        type=body.type,
        subject=body.subject,
        body=body.body,
        screenshot_url=body.screenshot_url,
    )
    db.add(fb)
    await db.flush()

    partner = await db.get(Partner, partner_id)
    user = await db.get(User, partner.user_id) if partner else None
    if user:
        background_tasks.add_task(
            dispatch_standalone,
            user_id=user.id, category="support", channels=("PUSH", "EMAIL"),
            title="We received your feedback",
            body=f"Thanks for reaching out about \"{fb.subject}\" — our support team will follow up soon.",
            notification_type="support_received", email_to=user.email,
        )

    return FeedbackResponse.model_validate(fb)


@router.get(
    "",
    response_model=list[FeedbackResponse],
    summary="Get feedback history",
    description=(
        "Returns paginated list of feedback entries submitted by the current partner.\n\n"
        "**Database tables:** `feedback`\n\n"
        "**Permissions:** Requires JWT token (role: partner)"
    ),
    responses={
        200: {"description": "List of feedback entries"},
        401: {"description": "Missing or invalid token"},
    },
)
async def get_feedback(
    partner_id: UUID = Depends(get_current_partner_id),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=20, le=100, description="Number of results per page (max 100)"),
    offset: int = Query(default=0, description="Number of results to skip"),
):
    stmt = (
        select(Feedback)
        .where(Feedback.partner_id == partner_id)
        .order_by(Feedback.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    items = (await db.execute(stmt)).scalars().all()
    return [FeedbackResponse.model_validate(f) for f in items]


@router.get(
    "/{feedback_id}",
    response_model=FeedbackResponse,
    summary="Get feedback detail",
    description=(
        "Returns full details for a specific feedback entry by ID.\n\n"
        "**Database tables:** `feedback`\n\n"
        "**Permissions:** Requires JWT token (role: partner)"
    ),
    responses={
        200: {"description": "Feedback details returned"},
        401: {"description": "Missing or invalid token"},
        404: {"description": "Feedback not found or not owned by partner"},
    },
)
async def get_feedback_detail(
    feedback_id: UUID,
    partner_id: UUID = Depends(get_current_partner_id),
    db: AsyncSession = Depends(get_db),
):
    fb = await db.get(Feedback, feedback_id)
    if not fb or fb.partner_id != partner_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Feedback not found")
    return FeedbackResponse.model_validate(fb)
