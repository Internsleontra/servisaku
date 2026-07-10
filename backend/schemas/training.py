from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

__all__ = [
    "TrainingModuleCreate", "TrainingModuleUpdate", "TrainingModuleResponse",
    "TrainingQuestionCreate", "TrainingQuestionUpdate", "TrainingQuestionResponse",
]


class TrainingModuleCreate(BaseModel):
    title: str
    description: str | None = None
    content_type: str = Field(..., description="VIDEO, PDF, or QUIZ")
    content_url: str | None = None
    service_category_id: UUID | None = None
    duration_minutes: int | None = None
    passing_score: int = 70
    total_questions: int = 20
    is_mandatory: bool = False


class TrainingModuleUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    content_url: str | None = None
    duration_minutes: int | None = None
    passing_score: int | None = None
    is_mandatory: bool | None = None
    is_active: bool | None = None


class TrainingModuleResponse(BaseModel):
    id: UUID
    service_category_id: UUID | None = None
    title: str
    description: str | None = None
    content_type: str
    content_url: str | None = None
    duration_minutes: int | None = None
    passing_score: int | None = None
    total_questions: int | None = None
    is_mandatory: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TrainingQuestionCreate(BaseModel):
    question_text: str
    option_a: str
    option_b: str
    option_c: str | None = None
    option_d: str | None = None
    correct_option: str = Field(..., description="A, B, C, or D")


class TrainingQuestionUpdate(BaseModel):
    question_text: str | None = None
    option_a: str | None = None
    option_b: str | None = None
    option_c: str | None = None
    option_d: str | None = None
    correct_option: str | None = None


class TrainingQuestionResponse(BaseModel):
    id: UUID
    training_module_id: UUID
    question_text: str
    option_a: str
    option_b: str
    option_c: str | None = None
    option_d: str | None = None
    correct_option: str
    created_at: datetime

    model_config = {"from_attributes": True}
