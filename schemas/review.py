from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field

__all__ = [
    "ReviewResponse", "RatingDistribution", "ReviewsSummaryResponse",
]


class ReviewResponse(BaseModel):
    id: UUID = Field(..., description="Review UUID")
    job_id: UUID = Field(..., description="Associated job UUID")
    customer_name: str = Field(..., description="Customer's full name")
    customer_avatar: str | None = Field(None, description="Customer's avatar URL")
    service_name: str = Field(..., description="Service type name")
    rating: int = Field(..., description="Rating (1-5 stars)")
    comment: str | None = Field(None, description="Review comment text")
    tags: list[str] = Field([], description="Review tags (e.g. punctual, professional)")
    date: datetime = Field(..., description="Review creation date")

    model_config = {"from_attributes": True}


class RatingDistribution(BaseModel):
    stars: int = Field(..., description="Star level (1-5)")
    count: int = Field(..., description="Number of reviews with this rating")


class ReviewsSummaryResponse(BaseModel):
    average: float = Field(..., description="Average rating across all reviews")
    total: int = Field(..., description="Total number of reviews")
    distribution: list[RatingDistribution] = Field(..., description="Rating distribution from 5 to 1 stars")
