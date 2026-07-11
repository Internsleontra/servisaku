import uuid
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import get_db
from auth import oauth2_scheme, decode_token, get_current_user_id, get_current_consumer_id
from models.partner import Partner, PartnerDocument, DOCUMENT_TYPE_VALUES
from models.consumer_profile import ConsumerProfile
from models.job import Job, JobPhoto
from schemas.upload import (
    AvatarUploadResponse, KYCDocumentResponse, JobPhotoResponse,
    SignedUploadRequest, SignedUploadResponse, ConfirmUploadRequest,
)
from services import cloudinary_service
from services.rate_limit import limiter
from utils.time import utc_now

router = APIRouter(prefix="/uploads", tags=["Uploads"])
settings = get_settings()

_KYC_DOCUMENT_TYPES = tuple(t for t in DOCUMENT_TYPE_VALUES if t != "PROFILE_PHOTO")


async def _current_avatar_scope(
    token: str = Depends(oauth2_scheme),
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> tuple[str, UUID]:
    payload = decode_token(token)
    role = payload.get("role")
    if role == "partner":
        return "partner", await _get_partner_id(user_id, db)
    if role == "consumer":
        consumer_id = await get_current_consumer_id(user_id=user_id, token=token, db=db)
        return "consumer", consumer_id
    raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")


async def _get_partner_id(user_id: UUID, db: AsyncSession) -> UUID:
    stmt = select(Partner.id).where(Partner.user_id == user_id)
    partner_id = (await db.execute(stmt)).scalar_one_or_none()
    if not partner_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Partner profile not found")
    return partner_id


async def _get_owned_job(job_id: UUID, partner_id: UUID, db: AsyncSession) -> Job:
    job = await db.get(Job, job_id)
    if not job or job.partner_id != partner_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    return job


async def _save_avatar(role: str, scope_id: UUID, url: str | None, db: AsyncSession) -> None:
    if role == "partner":
        partner = await db.get(Partner, scope_id)
        partner.profile_photo_s3_key = url
    else:
        profile = await db.get(ConsumerProfile, scope_id)
        profile.profile_photo_s3_key = url
    await db.flush()


async def _save_kyc_document(
    partner_id: UUID, document_type: str, url: str, file_name: str | None, db: AsyncSession,
) -> PartnerDocument:
    existing = (await db.execute(
        select(PartnerDocument).where(
            PartnerDocument.partner_id == partner_id, PartnerDocument.document_type == document_type,
        )
    )).scalar_one_or_none()
    if existing:
        existing.s3_key = url
        existing.file_name = file_name
        existing.verification_status = "PENDING"
        existing.rejection_reason = None
        existing.uploaded_at = utc_now()
        existing.verified_at = None
        doc = existing
    else:
        doc = PartnerDocument(partner_id=partner_id, document_type=document_type, s3_key=url, file_name=file_name)
        db.add(doc)
    await db.flush()
    return doc


async def _save_job_photo(job_id: UUID, photo_id: UUID, url: str, caption: str | None, db: AsyncSession) -> JobPhoto:
    photo = JobPhoto(id=photo_id, job_id=job_id, photo_url=url, caption=caption)
    db.add(photo)
    await db.flush()
    return photo


@router.post(
    "/avatar",
    response_model=AvatarUploadResponse,
    summary="Upload avatar (partner or consumer)",
    description=(
        "Uploads a profile photo. Validates the file's real content (magic bytes, not just "
        "the declared Content-Type), enforces the size limit, and optimizes it (auto quality/"
        "format, resized to fit 500x500) via Cloudinary. Re-uploading replaces the previous "
        "avatar in place — no orphaned files accumulate.\n\n"
        "**Database tables:** `partners.profile_photo_s3_key` or `consumer_profiles.profile_photo_s3_key`\n\n"
        "**Permissions:** Requires JWT token (role: partner or consumer)"
    ),
    responses={
        200: {"content": {"application/json": {"example": {"url": "https://res.cloudinary.com/demo/image/upload/v1/servisaku/avatars/partner_7a298b05.jpg"}}}},
        422: {"description": "Invalid file type or size", "content": {"application/json": {"example": {"error": {"code": "invalid_file_type", "message": "Unsupported or unrecognized image type...", "status": 422}}}}},
        503: {"description": "Cloudinary is not configured"},
    },
)
@limiter.limit(settings.RATE_LIMIT_UPLOAD)
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    scope: tuple = Depends(_current_avatar_scope),
    db: AsyncSession = Depends(get_db),
):
    role, scope_id = scope
    data = await file.read()
    cloudinary_service.validate_image_upload(data, file.content_type)

    folder, public_id = cloudinary_service.avatar_public_id(role, scope_id)
    result = await cloudinary_service.upload_image(data, folder=folder, public_id=public_id, max_width=500, max_height=500)

    await _save_avatar(role, scope_id, result["secure_url"], db)
    return AvatarUploadResponse(url=result["secure_url"])


@router.delete(
    "/avatar",
    summary="Delete avatar (partner or consumer)",
    description="Removes the current user's avatar from Cloudinary and clears the DB field.\n\n**Database tables:** `partners`/`consumer_profiles`\n\n**Permissions:** Requires JWT token (role: partner or consumer)",
    responses={200: {"content": {"application/json": {"example": {"deleted": True}}}}},
)
async def delete_avatar(
    scope: tuple = Depends(_current_avatar_scope),
    db: AsyncSession = Depends(get_db),
):
    role, scope_id = scope
    folder, public_id = cloudinary_service.avatar_public_id(role, scope_id)
    await cloudinary_service.delete_image(cloudinary_service.full_public_id(folder, public_id))
    await _save_avatar(role, scope_id, None, db)
    return {"deleted": True}


@router.post(
    "/kyc-documents",
    response_model=KYCDocumentResponse,
    status_code=201,
    summary="Upload a KYC document",
    description=(
        "Uploads a KYC document (MyKad front/back, passport, trade certificate, or bank "
        "statement — images only, no PDF). Re-uploading the same `document_type` replaces "
        "the previous file and resets `verification_status` back to `PENDING`.\n\n"
        "**Database tables:** `partner_documents`\n\n"
        "**Permissions:** Requires JWT token (role: partner)"
    ),
    responses={
        422: {"description": "Invalid file type/size, or invalid document_type"},
        503: {"description": "Cloudinary is not configured"},
    },
)
@limiter.limit(settings.RATE_LIMIT_UPLOAD)
async def upload_kyc_document(
    request: Request,
    document_type: Literal["MYKAD_FRONT", "MYKAD_BACK", "PASSPORT", "TRADE_CERTIFICATE", "BANK_STATEMENT"] = Form(...),
    file: UploadFile = File(...),
    user_id: UUID = Depends(get_current_user_id),
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    payload = decode_token(token)
    if payload.get("role") != "partner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
    partner_id = await _get_partner_id(user_id, db)

    data = await file.read()
    cloudinary_service.validate_image_upload(data, file.content_type)

    folder, public_id = cloudinary_service.kyc_document_public_id(partner_id, document_type)
    result = await cloudinary_service.upload_image(data, folder=folder, public_id=public_id, max_width=2000, max_height=2000)

    doc = await _save_kyc_document(partner_id, document_type, result["secure_url"], file.filename, db)
    return KYCDocumentResponse(
        id=doc.id, document_type=doc.document_type, url=doc.s3_key,
        file_name=doc.file_name, verification_status=doc.verification_status, uploaded_at=doc.uploaded_at,
    )


@router.get(
    "/kyc-documents",
    response_model=list[KYCDocumentResponse],
    summary="List my KYC documents",
    description="Returns all KYC documents uploaded by the current partner.\n\n**Database tables:** `partner_documents`\n\n**Permissions:** Requires JWT token (role: partner)",
)
async def list_kyc_documents(
    user_id: UUID = Depends(get_current_user_id),
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    payload = decode_token(token)
    if payload.get("role") != "partner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
    partner_id = await _get_partner_id(user_id, db)

    stmt = select(PartnerDocument).where(PartnerDocument.partner_id == partner_id).order_by(PartnerDocument.uploaded_at.desc())
    docs = (await db.execute(stmt)).scalars().all()
    return [
        KYCDocumentResponse(
            id=d.id, document_type=d.document_type, url=d.s3_key,
            file_name=d.file_name, verification_status=d.verification_status, uploaded_at=d.uploaded_at,
        )
        for d in docs
    ]


@router.delete(
    "/kyc-documents/{document_id}",
    summary="Delete a KYC document",
    description="Deletes one of the current partner's KYC documents.\n\n**Database tables:** `partner_documents`\n\n**Permissions:** Requires JWT token (role: partner)",
    responses={404: {"description": "Document not found"}},
)
async def delete_kyc_document(
    document_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    payload = decode_token(token)
    if payload.get("role") != "partner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
    partner_id = await _get_partner_id(user_id, db)

    doc = await db.get(PartnerDocument, document_id)
    if not doc or doc.partner_id != partner_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")

    folder, public_id = cloudinary_service.kyc_document_public_id(partner_id, doc.document_type)
    await cloudinary_service.delete_image(cloudinary_service.full_public_id(folder, public_id))
    await db.delete(doc)
    await db.flush()
    return {"deleted": True}


@router.post(
    "/jobs/{job_id}/photos",
    response_model=JobPhotoResponse,
    status_code=201,
    summary="Upload a job photo (before/after)",
    description=(
        "Uploads a photo for a job owned by the current partner. `photo_type` tags it as "
        "`before`, `after`, or `general` (stored in the existing `caption` field).\n\n"
        "**Database tables:** `job_photos`\n\n"
        "**Permissions:** Requires JWT token (role: partner, owning the job)"
    ),
    responses={
        404: {"description": "Job not found"},
        422: {"description": "Invalid file type or size"},
        503: {"description": "Cloudinary is not configured"},
    },
)
@limiter.limit(settings.RATE_LIMIT_UPLOAD)
async def upload_job_photo(
    request: Request,
    job_id: UUID,
    photo_type: Literal["before", "after", "general"] = Form("general"),
    caption: str | None = Form(None),
    file: UploadFile = File(...),
    user_id: UUID = Depends(get_current_user_id),
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    payload = decode_token(token)
    if payload.get("role") != "partner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
    partner_id = await _get_partner_id(user_id, db)
    job = await _get_owned_job(job_id, partner_id, db)

    data = await file.read()
    cloudinary_service.validate_image_upload(data, file.content_type)

    photo_id = uuid.uuid4()
    folder, public_id = cloudinary_service.job_photo_public_id(job.id, photo_id)
    result = await cloudinary_service.upload_image(data, folder=folder, public_id=public_id, max_width=1600, max_height=1600)

    label = f"{photo_type}: {caption}" if caption else photo_type
    photo = await _save_job_photo(job.id, photo_id, result["secure_url"], label, db)
    return JobPhotoResponse(id=photo.id, job_id=photo.job_id, url=photo.photo_url, caption=photo.caption, uploaded_at=photo.uploaded_at)


@router.get(
    "/jobs/{job_id}/photos",
    response_model=list[JobPhotoResponse],
    summary="List a job's photos",
    description="Returns all photos for a job owned by the current partner.\n\n**Database tables:** `job_photos`\n\n**Permissions:** Requires JWT token (role: partner, owning the job)",
    responses={404: {"description": "Job not found"}},
)
async def list_job_photos(
    job_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    payload = decode_token(token)
    if payload.get("role") != "partner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
    partner_id = await _get_partner_id(user_id, db)
    await _get_owned_job(job_id, partner_id, db)

    stmt = select(JobPhoto).where(JobPhoto.job_id == job_id).order_by(JobPhoto.uploaded_at.desc())
    photos = (await db.execute(stmt)).scalars().all()
    return [JobPhotoResponse(id=p.id, job_id=p.job_id, url=p.photo_url, caption=p.caption, uploaded_at=p.uploaded_at) for p in photos]


@router.delete(
    "/jobs/{job_id}/photos/{photo_id}",
    summary="Delete a job photo",
    description="Deletes one photo from a job owned by the current partner.\n\n**Database tables:** `job_photos`\n\n**Permissions:** Requires JWT token (role: partner, owning the job)",
    responses={404: {"description": "Job or photo not found"}},
)
async def delete_job_photo(
    job_id: UUID,
    photo_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    payload = decode_token(token)
    if payload.get("role") != "partner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
    partner_id = await _get_partner_id(user_id, db)
    job = await _get_owned_job(job_id, partner_id, db)

    photo = await db.get(JobPhoto, photo_id)
    if not photo or photo.job_id != job.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo not found")

    folder, public_id = cloudinary_service.job_photo_public_id(job.id, photo.id)
    await cloudinary_service.delete_image(cloudinary_service.full_public_id(folder, public_id))
    await db.delete(photo)
    await db.flush()
    return {"deleted": True}


@router.post(
    "/signature",
    response_model=SignedUploadResponse,
    summary="Get a signed upload URL",
    description=(
        "Returns a signed set of parameters so the mobile app can upload a file **directly** "
        "to Cloudinary, bypassing this server for the file bytes (useful for large uploads "
        "on slow connections). The client must POST the returned params + file as "
        "multipart/form-data to `upload_url`, then call `POST /uploads/confirm` with the "
        "resulting `public_id`/`secure_url` so this backend records it — Cloudinary does not "
        "call back automatically.\n\n"
        "**Permissions:** Requires JWT token (role matching `upload_type`)"
    ),
    responses={
        403: {"description": "Insufficient permissions for the requested upload_type"},
        404: {"description": "Job not found (for job_photo)"},
        422: {"description": "Missing document_type/job_id for the given upload_type"},
        503: {"description": "Cloudinary is not configured"},
    },
)
async def get_upload_signature(
    body: SignedUploadRequest,
    user_id: UUID = Depends(get_current_user_id),
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    payload = decode_token(token)
    role = payload.get("role")

    if body.upload_type == "avatar":
        if role not in ("partner", "consumer"):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        role2, scope_id = await _current_avatar_scope(token=token, user_id=user_id, db=db)
        folder, public_id = cloudinary_service.avatar_public_id(role2, scope_id)

    elif body.upload_type == "kyc_document":
        if role != "partner":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        if not body.document_type:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "document_type is required")
        partner_id = await _get_partner_id(user_id, db)
        folder, public_id = cloudinary_service.kyc_document_public_id(partner_id, body.document_type)

    else:  # job_photo
        if role != "partner":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        if not body.job_id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "job_id is required")
        partner_id = await _get_partner_id(user_id, db)
        job = await _get_owned_job(body.job_id, partner_id, db)
        folder, public_id = cloudinary_service.job_photo_public_id(job.id, uuid.uuid4())

    params = cloudinary_service.generate_signed_upload_params(folder=folder, public_id=public_id)
    return SignedUploadResponse(**params)


@router.post(
    "/confirm",
    summary="Confirm a direct-to-Cloudinary upload",
    description=(
        "Tells this backend a signed direct upload (see `POST /uploads/signature`) "
        "completed, so it can persist the result. Re-derives the expected `public_id` for "
        "the caller's scope and rejects the request if the client-supplied `public_id` "
        "doesn't match — this prevents a client from claiming an asset it wasn't issued a "
        "signature for.\n\n"
        "**Permissions:** Requires JWT token (role matching `upload_type`)"
    ),
    responses={
        200: {"content": {"application/json": {"example": {"status": "saved", "url": "https://res.cloudinary.com/demo/image/upload/v1/servisaku/kyc/7a298b05_mykad_front.jpg"}}}},
        403: {"description": "public_id does not match a signature issued to this account"},
        404: {"description": "Job not found (for job_photo)"},
    },
)
async def confirm_upload(
    body: ConfirmUploadRequest,
    user_id: UUID = Depends(get_current_user_id),
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    payload = decode_token(token)
    role = payload.get("role")

    if body.upload_type == "avatar":
        if role not in ("partner", "consumer"):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        role2, scope_id = await _current_avatar_scope(token=token, user_id=user_id, db=db)
        folder, public_id = cloudinary_service.avatar_public_id(role2, scope_id)
        if body.public_id != cloudinary_service.full_public_id(folder, public_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "public_id does not match a signature issued to this account")
        await _save_avatar(role2, scope_id, body.secure_url, db)
        return {"status": "saved", "url": body.secure_url}

    if body.upload_type == "kyc_document":
        if role != "partner":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        if not body.document_type:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "document_type is required")
        partner_id = await _get_partner_id(user_id, db)
        folder, public_id = cloudinary_service.kyc_document_public_id(partner_id, body.document_type)
        if body.public_id != cloudinary_service.full_public_id(folder, public_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "public_id does not match a signature issued to this account")
        doc = await _save_kyc_document(partner_id, body.document_type, body.secure_url, body.file_name, db)
        return {"status": "saved", "url": body.secure_url, "document_id": str(doc.id)}

    # job_photo — the per-photo ID is random (issued fresh by /signature, not
    # re-derivable), so we validate the *prefix* (this job, owned by this
    # partner) and trust the trailing UUID rather than recomputing it.
    if role != "partner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
    if not body.job_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "job_id is required")
    partner_id = await _get_partner_id(user_id, db)
    job = await _get_owned_job(body.job_id, partner_id, db)

    expected_prefix = f"servisaku/jobs/{job.id}/"
    if not body.public_id.startswith(expected_prefix):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "public_id does not belong to this job")
    try:
        photo_id = uuid.UUID(body.public_id[len(expected_prefix):])
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid public_id format")

    label = f"{body.photo_type}: {body.file_name}" if body.file_name else body.photo_type
    photo = await _save_job_photo(job.id, photo_id, body.secure_url, label, db)
    return {"status": "saved", "url": body.secure_url, "photo_id": str(photo.id)}
