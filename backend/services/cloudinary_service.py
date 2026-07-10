import io
import time

import cloudinary
import cloudinary.uploader
import cloudinary.utils
from fastapi.concurrency import run_in_threadpool

from config import get_settings
from utils.errors import AppException

settings = get_settings()

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}

# Magic-byte signatures, checked against the actual file content rather than
# trusting the client-supplied Content-Type header (which is easy to spoof).
_MAGIC_BYTES: dict[str, bytes] = {
    "image/jpeg": b"\xff\xd8\xff",
    "image/png": b"\x89PNG\r\n\x1a\n",
}

_configured = False


def _ensure_configured() -> None:
    global _configured
    if not settings.CLOUDINARY_CLOUD_NAME or not settings.CLOUDINARY_API_KEY or not settings.CLOUDINARY_API_SECRET:
        raise AppException(
            "media_storage_not_configured",
            "Cloudinary is not configured. Sign up free at "
            "https://cloudinary.com/users/register/free and set "
            "CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET in .env.",
            status_code=503,
        )
    if not _configured:
        cloudinary.config(
            cloud_name=settings.CLOUDINARY_CLOUD_NAME,
            api_key=settings.CLOUDINARY_API_KEY,
            api_secret=settings.CLOUDINARY_API_SECRET,
            secure=True,
        )
        _configured = True


def sniff_image_mime(data: bytes) -> str | None:
    """Detects the real image type from its magic bytes. WEBP's signature is
    checked separately since it needs a 12-byte RIFF/WEBP header, not a fixed
    prefix."""
    if data[:12].startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp"
    for mime, sig in _MAGIC_BYTES.items():
        if data.startswith(sig):
            return mime
    return None


def validate_image_upload(data: bytes, declared_content_type: str | None) -> str:
    """Validates size + real (sniffed) MIME type. Returns the sniffed MIME
    type. Raises AppException (422) on any validation failure."""
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if not data:
        raise AppException("empty_file", "Uploaded file is empty", status_code=422)
    if len(data) > max_bytes:
        raise AppException(
            "file_too_large",
            f"File exceeds the {settings.MAX_UPLOAD_SIZE_MB}MB limit "
            f"({len(data) / 1024 / 1024:.1f}MB uploaded)",
            status_code=422,
        )
    sniffed = sniff_image_mime(data)
    if sniffed is None or sniffed not in ALLOWED_IMAGE_TYPES:
        raise AppException(
            "invalid_file_type",
            f"Unsupported or unrecognized image type. Allowed: {', '.join(sorted(ALLOWED_IMAGE_TYPES))}. "
            f"Declared Content-Type was '{declared_content_type}'.",
            status_code=422,
        )
    return sniffed


async def upload_image(
    file_bytes: bytes, *, folder: str, public_id: str,
    max_width: int | None = None, max_height: int | None = None,
) -> dict:
    """Server-side validated upload with automatic quality/format
    optimization. Overwrites any existing asset at the same public_id, so
    re-uploading an avatar/KYC document naturally replaces the old one
    instead of accumulating orphaned assets on the free-tier quota."""
    _ensure_configured()
    options = {
        "folder": folder,
        "public_id": public_id,
        "resource_type": "image",
        "quality": "auto",
        "fetch_format": "auto",
        "overwrite": True,
        "invalidate": True,
    }
    if max_width or max_height:
        options["transformation"] = [{
            "width": max_width, "height": max_height, "crop": "limit",
        }]
    return await run_in_threadpool(cloudinary.uploader.upload, io.BytesIO(file_bytes), **options)


async def delete_image(public_id: str) -> dict:
    _ensure_configured()
    return await run_in_threadpool(
        cloudinary.uploader.destroy, public_id, resource_type="image", invalidate=True,
    )


def generate_signed_upload_params(*, folder: str, public_id: str) -> dict:
    """For direct client-to-Cloudinary uploads that bypass this server for
    the file bytes (e.g. large mobile uploads over a slow connection). The
    client must still call POST /uploads/confirm afterwards so this backend
    learns the upload happened — Cloudinary doesn't call back automatically
    without extra webhook configuration, which is out of scope here."""
    _ensure_configured()
    timestamp = int(time.time())
    params_to_sign = {"timestamp": timestamp, "folder": folder, "public_id": public_id, "overwrite": True}
    signature = cloudinary.utils.api_sign_request(params_to_sign, settings.CLOUDINARY_API_SECRET)
    return {
        "signature": signature,
        "timestamp": timestamp,
        "api_key": settings.CLOUDINARY_API_KEY,
        "cloud_name": settings.CLOUDINARY_CLOUD_NAME,
        "folder": folder,
        "public_id": public_id,
        "overwrite": True,
        "upload_url": f"https://api.cloudinary.com/v1_1/{settings.CLOUDINARY_CLOUD_NAME}/image/upload",
    }


# --- Deterministic (folder, public_id) naming so deletion never needs to
# parse a stored URL — every ID is re-derivable from data already in the DB.
# Cloudinary joins folder+public_id into one full asset ID ("folder/public_id")
# — destroy() needs that joined form, upload() takes them as separate params.

def avatar_public_id(kind: str, scope_id) -> tuple[str, str]:
    return "servisaku/avatars", f"{kind}_{scope_id}"


def kyc_document_public_id(partner_id, document_type: str) -> tuple[str, str]:
    return "servisaku/kyc", f"{partner_id}_{document_type.lower()}"


def job_photo_public_id(job_id, photo_id) -> tuple[str, str]:
    return f"servisaku/jobs/{job_id}", str(photo_id)


def full_public_id(folder: str, public_id: str) -> str:
    return f"{folder}/{public_id}"
