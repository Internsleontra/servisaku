"""Unit tests against the REAL (unconfigured) provider classes — no mocking
at all. Every credential (Billplz, Cloudinary, Firebase, Resend, Brevo,
MailerSend) is blank in this environment's .env (see
docs/today-work/TEST_REPORT.md), so these tests exercise exactly what a
caller gets today: clean, typed "not configured" failures rather than a
crash or a hang. This is the real code path, unmocked — it is NOT a
substitute for real sandbox/live verification (making an actual Billplz
sandbox bill, an actual Cloudinary upload, an actual Firebase push, an
actual outbound email), none of which is possible without real credentials.
See tests/test_unit_notification_dispatcher.py for the mocked-provider-
boundary tests covering the dispatcher's own orchestration logic."""
import pytest

from services import cloudinary_service
from services.billplz_gateway import BillplzGateway
from services.gateway_registry import get_gateway
from services.ipay88_gateway import IPay88Gateway
from services.notifications.brevo_email import BrevoEmailProvider
from services.notifications.firebase_push import FirebasePushProvider
from services.notifications.mailersend_email import MailerSendEmailProvider
from services.notifications.mock_sms import MockSMSProvider
from services.notifications.resend_email import ResendEmailProvider
from utils.errors import AppException


# --- Push: Firebase (unconfigured) -----------------------------------------

async def test_firebase_send_to_token_returns_clean_failure_when_unconfigured():
    result = await FirebasePushProvider().send_to_token("fake-device-token", "title", "body")
    assert result.success is False
    assert "not configured" in result.error.lower()


async def test_firebase_send_to_topic_returns_clean_failure_when_unconfigured():
    result = await FirebasePushProvider().send_to_topic("fake-topic", "title", "body")
    assert result.success is False
    assert "not configured" in result.error.lower()


async def test_firebase_subscribe_to_topic_raises_when_unconfigured():
    with pytest.raises(AppException) as exc_info:
        await FirebasePushProvider().subscribe_to_topic(["tok1"], "fake-topic")
    assert exc_info.value.status_code == 503


async def test_firebase_unsubscribe_from_topic_raises_when_unconfigured():
    with pytest.raises(AppException) as exc_info:
        await FirebasePushProvider().unsubscribe_from_topic(["tok1"], "fake-topic")
    assert exc_info.value.status_code == 503


# --- Email fallback chain providers (unconfigured) --------------------------

async def test_resend_is_not_configured_and_send_fails_cleanly_without_a_network_call():
    provider = ResendEmailProvider()
    assert provider.is_configured() is False
    result = await provider.send("test@example.com", "subject", "<p>html</p>")
    assert result.success is False
    assert "not configured" in result.error.lower()


async def test_brevo_is_not_configured_and_send_fails_cleanly_without_a_network_call():
    provider = BrevoEmailProvider()
    assert provider.is_configured() is False
    result = await provider.send("test@example.com", "subject", "<p>html</p>")
    assert result.success is False
    assert "not configured" in result.error.lower()


async def test_mailersend_is_not_configured_and_send_fails_cleanly_without_a_network_call():
    provider = MailerSendEmailProvider()
    assert provider.is_configured() is False
    result = await provider.send("test@example.com", "subject", "<p>html</p>")
    assert result.success is False
    assert "not configured" in result.error.lower()


# --- SMS: mock provider (no external credentials required by design) -------

async def test_mock_sms_provider_always_succeeds():
    """Unlike the push/email providers, MockSMSProvider isn't credential-
    gated — it's a deliberate placeholder for a future real SMS gateway
    (see its module docstring). This just confirms the interface contract:
    always returns a successful, uniquely-identified result."""
    provider = MockSMSProvider()
    result = await provider.send("+60100000099", "pytest mock sms message")
    assert result.success is True
    assert result.provider_message_id.startswith("mock-")


# --- Payments: Billplz (unconfigured) ---------------------------------------

async def test_billplz_create_bill_raises_503_when_unconfigured():
    with pytest.raises(AppException) as exc_info:
        await BillplzGateway().create_bill(
            amount=100, name="Test", email="test@example.com", mobile=None,
            description="pytest", reference_label="ref", reference="REF-1",
        )
    assert exc_info.value.status_code == 503


async def test_billplz_get_bill_raises_503_when_unconfigured():
    with pytest.raises(AppException) as exc_info:
        await BillplzGateway().get_bill("fake-bill-id")
    assert exc_info.value.status_code == 503


def test_billplz_verify_callback_signature_returns_false_without_a_signature_key():
    """No BILLPLZ_X_SIGNATURE_KEY configured — must fail closed (reject),
    never silently accept an unverifiable callback."""
    assert BillplzGateway().verify_callback_signature({"id": "x", "paid": "true", "x_signature": "anything"}) is False


def test_billplz_to_cents_and_from_bill_json_helpers_are_correct():
    """Pure helper logic, no credentials involved — real correctness check,
    not a "not configured" check."""
    from decimal import Decimal
    assert BillplzGateway._to_cents(Decimal("150.00")) == 15000
    assert BillplzGateway._to_cents(Decimal("0.01")) == 1

    bill = BillplzGateway._from_bill_json({"id": "abc", "url": "https://example.com/bill", "paid": True, "amount": "15000"})
    assert bill.gateway_transaction_id == "abc"
    assert bill.paid is True
    assert bill.amount == Decimal("150")


# --- Payments: iPay88 (permanent stub — no self-serve sandbox exists) ------

async def test_ipay88_every_method_raises_503_stub():
    gateway = IPay88Gateway()
    for coro in (
        gateway.create_bill(amount=100, name="Test", email="test@example.com", mobile=None, description="d", reference_label="r", reference="REF-1"),
        gateway.get_bill("fake-id"),
    ):
        with pytest.raises(AppException) as exc_info:
            await coro
        assert exc_info.value.status_code == 503


def test_ipay88_verify_callback_signature_raises_503_stub():
    with pytest.raises(AppException) as exc_info:
        IPay88Gateway().verify_callback_signature({})
    assert exc_info.value.status_code == 503


def test_gateway_registry_resolves_both_gateways_by_name():
    assert isinstance(get_gateway("BILLPLZ"), BillplzGateway)
    assert isinstance(get_gateway("IPAY88"), IPay88Gateway)


def test_gateway_registry_raises_on_an_unknown_gateway_name():
    with pytest.raises(AppException) as exc_info:
        get_gateway("STRIPE")
    assert exc_info.value.status_code == 400


# --- Uploads: Cloudinary (unconfigured for the network calls; validation is
#     real credential-independent logic and is tested for real correctness) -

async def test_cloudinary_upload_raises_503_when_unconfigured():
    with pytest.raises(AppException) as exc_info:
        await cloudinary_service.upload_image(b"fake-image-bytes", folder="servisaku/test", public_id="pytest-test")
    assert exc_info.value.status_code == 503


async def test_cloudinary_delete_raises_503_when_unconfigured():
    with pytest.raises(AppException) as exc_info:
        await cloudinary_service.delete_image("servisaku/test/pytest-test")
    assert exc_info.value.status_code == 503


def test_cloudinary_signed_upload_params_raises_503_when_unconfigured():
    with pytest.raises(AppException) as exc_info:
        cloudinary_service.generate_signed_upload_params(folder="servisaku/test", public_id="pytest-test")
    assert exc_info.value.status_code == 503


def test_cloudinary_sniff_image_mime_detects_jpeg_png_webp_and_unknown():
    jpeg_bytes = b"\xff\xd8\xff" + b"\x00" * 20
    png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
    webp_bytes = b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"\x00" * 20
    garbage_bytes = b"not-a-real-image" + b"\x00" * 20

    assert cloudinary_service.sniff_image_mime(jpeg_bytes) == "image/jpeg"
    assert cloudinary_service.sniff_image_mime(png_bytes) == "image/png"
    assert cloudinary_service.sniff_image_mime(webp_bytes) == "image/webp"
    assert cloudinary_service.sniff_image_mime(garbage_bytes) is None


def test_cloudinary_validate_image_upload_rejects_empty_file():
    with pytest.raises(AppException) as exc_info:
        cloudinary_service.validate_image_upload(b"", "image/jpeg")
    assert exc_info.value.status_code == 422
    assert exc_info.value.code == "empty_file"


def test_cloudinary_validate_image_upload_rejects_oversized_file():
    from config import get_settings
    settings = get_settings()
    oversized = b"\xff\xd8\xff" + b"\x00" * (settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024 + 1)
    with pytest.raises(AppException) as exc_info:
        cloudinary_service.validate_image_upload(oversized, "image/jpeg")
    assert exc_info.value.status_code == 422
    assert exc_info.value.code == "file_too_large"


def test_cloudinary_validate_image_upload_rejects_a_non_image_payload():
    with pytest.raises(AppException) as exc_info:
        cloudinary_service.validate_image_upload(b"%PDF-1.4 fake pdf content", "application/pdf")
    assert exc_info.value.status_code == 422
    assert exc_info.value.code == "invalid_file_type"


def test_cloudinary_validate_image_upload_accepts_a_real_jpeg_signature():
    valid_jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 100
    sniffed = cloudinary_service.validate_image_upload(valid_jpeg, "image/jpeg")
    assert sniffed == "image/jpeg"


def test_cloudinary_public_id_helpers_are_deterministic():
    """Pure naming logic (no credentials) — the docstring in
    services/cloudinary_service.py explains why this must be re-derivable
    from DB fields alone, so a wrong/changed naming scheme would silently
    break delete-on-reupload for every existing avatar/KYC doc/job photo."""
    import uuid
    partner_id = uuid.uuid4()
    job_id = uuid.uuid4()
    photo_id = uuid.uuid4()

    folder, public_id = cloudinary_service.avatar_public_id("partner", partner_id)
    assert folder == "servisaku/avatars"
    assert public_id == f"partner_{partner_id}"

    folder, public_id = cloudinary_service.kyc_document_public_id(partner_id, "MYKAD_FRONT")
    assert folder == "servisaku/kyc"
    assert public_id == f"{partner_id}_mykad_front"

    folder, public_id = cloudinary_service.job_photo_public_id(job_id, photo_id)
    assert folder == f"servisaku/jobs/{job_id}"
    assert public_id == str(photo_id)

    assert cloudinary_service.full_public_id("a/b", "c") == "a/b/c"
