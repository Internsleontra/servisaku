"""Unit tests — services/cloudinary_service.py magic-byte MIME sniffing and
upload validation. Pure functions, no Cloudinary credentials/network needed."""
import pytest

from services.cloudinary_service import sniff_image_mime, validate_image_upload
from utils.errors import AppException

JPEG_HEADER = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 100
PNG_HEADER = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
WEBP_HEADER = b"RIFF\x24\x00\x00\x00WEBP" + b"\x00" * 100


def test_sniff_image_mime_detects_jpeg_by_magic_bytes():
    assert sniff_image_mime(JPEG_HEADER) == "image/jpeg"


def test_sniff_image_mime_detects_png_by_magic_bytes():
    assert sniff_image_mime(PNG_HEADER) == "image/png"


def test_sniff_image_mime_detects_webp_by_riff_header():
    assert sniff_image_mime(WEBP_HEADER) == "image/webp"


def test_sniff_image_mime_returns_none_for_unrecognized_data():
    assert sniff_image_mime(b"not an image, just plain text bytes") is None


def test_sniff_image_mime_ignores_a_spoofed_content_type_and_looks_at_real_bytes():
    # A .txt file renamed to .jpg would still fail sniffing — that's the point.
    fake_jpeg = b"this is actually plain text"
    assert sniff_image_mime(fake_jpeg) is None


def test_validate_image_upload_accepts_a_real_jpeg():
    sniffed = validate_image_upload(JPEG_HEADER, "image/jpeg")
    assert sniffed == "image/jpeg"


def test_validate_image_upload_rejects_empty_file():
    with pytest.raises(AppException) as exc_info:
        validate_image_upload(b"", "image/jpeg")
    assert exc_info.value.status_code == 422


def test_validate_image_upload_rejects_oversized_file():
    from config import get_settings
    settings = get_settings()
    oversized = JPEG_HEADER + b"\x00" * (settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024)
    with pytest.raises(AppException) as exc_info:
        validate_image_upload(oversized, "image/jpeg")
    assert exc_info.value.status_code == 422


def test_validate_image_upload_rejects_non_image_content_even_with_image_content_type_header():
    with pytest.raises(AppException) as exc_info:
        validate_image_upload(b"<html><body>not an image</body></html>", "image/jpeg")
    assert exc_info.value.status_code == 422
