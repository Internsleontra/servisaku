from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field

__all__ = [
    "FeedbackRequest", "FeedbackResponse",
]


class FeedbackRequest(BaseModel):
    type: str = Field(default="general", pattern=r"^(bug|feature|complaint|general)$", description="Feedback type: bug, feature, complaint, general")
    subject: str = Field(..., min_length=3, max_length=200, description="Feedback subject line")
    body: str = Field(..., min_length=10, description="Detailed feedback description")
    screenshot_url: str | None = Field(None, description="Optional screenshot URL for bug reports")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "type": "bug",
                    "subject": "App crashes on job accept",
                    "body": "When I tap accept on a new job request, the app crashes and returns to home screen.",
                    "screenshot_url": None,
                }
            ]
        }
    }


class FeedbackResponse(BaseModel):
    id: UUID = Field(..., description="Feedback UUID")
    type: str = Field(..., description="Feedback type")
    subject: str = Field(..., description="Subject line")
    body: str = Field(..., description="Feedback description")
    screenshot_url: str | None = Field(None, description="Screenshot URL")
    status: str = Field(..., description="Status: open, resolved")
    created_at: datetime = Field(..., description="Submission timestamp")
    resolved_at: datetime | None = Field(None, description="Resolution timestamp")

    model_config = {"from_attributes": True}
