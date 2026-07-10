from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import get_current_admin_id
from models.training import TrainingModule, TrainingQuestion, TRAINING_CONTENT_TYPE_VALUES
from schemas.training import (
    TrainingModuleCreate, TrainingModuleUpdate, TrainingModuleResponse,
    TrainingQuestionCreate, TrainingQuestionUpdate, TrainingQuestionResponse,
)
from services.rbac import log_admin_action

router = APIRouter(prefix="/admin/training", tags=["Admin - Training"])

# No permission in the seeded `permissions` table maps cleanly to training
# content management (the closest, `pricing.manage`, is semantically wrong) —
# gated at the coarse role:admin level only, same as every endpoint before
# Stage 6 introduced granular RBAC. See docs/ADMIN_BACKEND.md.


@router.get("/modules", response_model=list[TrainingModuleResponse], summary="List training modules",
    description="**Database tables:** `training_modules`\n\n**Permissions:** Requires JWT token (role: admin)")
async def list_modules(
    _admin_id: UUID = Depends(get_current_admin_id), db: AsyncSession = Depends(get_db),
    service_category_id: UUID | None = Query(default=None),
):
    stmt = select(TrainingModule)
    if service_category_id:
        stmt = stmt.where(TrainingModule.service_category_id == service_category_id)
    rows = (await db.execute(stmt)).scalars().all()
    return [TrainingModuleResponse.model_validate(r) for r in rows]


@router.post("/modules", response_model=TrainingModuleResponse, status_code=201, summary="Create a training module",
    description="**Database tables:** `training_modules`\n\n**Permissions:** Requires JWT token (role: admin)",
    responses={422: {"description": "Invalid content_type"}})
async def create_module(body: TrainingModuleCreate, admin_id: UUID = Depends(get_current_admin_id), db: AsyncSession = Depends(get_db)):
    if body.content_type not in TRAINING_CONTENT_TYPE_VALUES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"content_type must be one of {TRAINING_CONTENT_TYPE_VALUES}")
    row = TrainingModule(**body.model_dump())
    db.add(row)
    await db.flush()
    await log_admin_action(db, admin_id, "training.module_created", "training_module", row.id, row.title)
    return TrainingModuleResponse.model_validate(row)


@router.put("/modules/{module_id}", response_model=TrainingModuleResponse, summary="Update a training module",
    description="**Database tables:** `training_modules`\n\n**Permissions:** Requires JWT token (role: admin)",
    responses={404: {"description": "Module not found"}})
async def update_module(module_id: UUID, body: TrainingModuleUpdate, _admin_id: UUID = Depends(get_current_admin_id), db: AsyncSession = Depends(get_db)):
    row = await db.get(TrainingModule, module_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Module not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await db.flush()
    return TrainingModuleResponse.model_validate(row)


@router.delete("/modules/{module_id}", summary="Deactivate a training module",
    description="**Database tables:** `training_modules`\n\n**Permissions:** Requires JWT token (role: admin)",
    responses={404: {"description": "Module not found"}})
async def deactivate_module(module_id: UUID, _admin_id: UUID = Depends(get_current_admin_id), db: AsyncSession = Depends(get_db)):
    row = await db.get(TrainingModule, module_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Module not found")
    row.is_active = False
    await db.flush()
    return {"id": str(module_id), "is_active": False}


@router.get("/modules/{module_id}/questions", response_model=list[TrainingQuestionResponse], summary="List a module's questions",
    description="**Database tables:** `training_questions`\n\n**Permissions:** Requires JWT token (role: admin)")
async def list_questions(module_id: UUID, _admin_id: UUID = Depends(get_current_admin_id), db: AsyncSession = Depends(get_db)):
    stmt = select(TrainingQuestion).where(TrainingQuestion.training_module_id == module_id)
    rows = (await db.execute(stmt)).scalars().all()
    return [TrainingQuestionResponse.model_validate(r) for r in rows]


@router.post("/modules/{module_id}/questions", response_model=TrainingQuestionResponse, status_code=201, summary="Add a question to a module",
    description="**Database tables:** `training_questions`\n\n**Permissions:** Requires JWT token (role: admin)",
    responses={404: {"description": "Module not found"}, 422: {"description": "correct_option must be A, B, C, or D"}})
async def create_question(module_id: UUID, body: TrainingQuestionCreate, admin_id: UUID = Depends(get_current_admin_id), db: AsyncSession = Depends(get_db)):
    if not await db.get(TrainingModule, module_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Module not found")
    if body.correct_option.upper() not in ("A", "B", "C", "D"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "correct_option must be A, B, C, or D")
    row = TrainingQuestion(training_module_id=module_id, **body.model_dump())
    db.add(row)
    await db.flush()
    await log_admin_action(db, admin_id, "training.question_created", "training_question", row.id, None)
    return TrainingQuestionResponse.model_validate(row)


@router.put("/questions/{question_id}", response_model=TrainingQuestionResponse, summary="Update a question",
    description="**Database tables:** `training_questions`\n\n**Permissions:** Requires JWT token (role: admin)",
    responses={404: {"description": "Question not found"}})
async def update_question(question_id: UUID, body: TrainingQuestionUpdate, _admin_id: UUID = Depends(get_current_admin_id), db: AsyncSession = Depends(get_db)):
    row = await db.get(TrainingQuestion, question_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Question not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await db.flush()
    return TrainingQuestionResponse.model_validate(row)


@router.delete("/questions/{question_id}", summary="Delete a question",
    description="**Database tables:** `training_questions`\n\n**Permissions:** Requires JWT token (role: admin)",
    responses={404: {"description": "Question not found"}})
async def delete_question(question_id: UUID, _admin_id: UUID = Depends(get_current_admin_id), db: AsyncSession = Depends(get_db)):
    row = await db.get(TrainingQuestion, question_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Question not found")
    await db.delete(row)
    await db.flush()
    return {"id": str(question_id), "deleted": True}
