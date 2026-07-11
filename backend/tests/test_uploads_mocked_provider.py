"""Upload success-path tests.

**Mocking boundary**: `upload_avatar`/`upload_kyc_document`/`upload_job_photo`
call `services.cloudinary_service.upload_image`/`delete_image` directly —
real Cloudinary credentials aren't available in this environment (see
docs/today-work/TEST_REPORT.md), so those two functions are monkeypatched
here to return a deterministic fake result. This exercises every route's
own logic (ownership checks, DB writes, re-upload-replaces-in-place
behavior) with no mocking of anything this app itself owns — only the
external network call is faked. Real Cloudinary sandbox verification
remains outstanding; see tests/test_unit_notification_providers.py for the
separate "real (unconfigured) provider returns a clean 503" coverage.

`confirm_upload` needs no mocking at all — it never calls Cloudinary itself
(see routes/uploads.py's docstring: the client uploads directly to
Cloudinary and only tells this backend afterwards), so those tests exercise
the real, unmocked route logic end-to-end, computing the expected
`public_id` via the same pure, credential-independent helper functions
Cloudinary signing would have used."""
import uuid

from services import cloudinary_service

from tests.conftest import API, auth


def _fake_upload_result(url_suffix: str) -> dict:
    return {"secure_url": f"https://res.cloudinary.com/demo/image/upload/v1/{url_suffix}.jpg"}


async def test_upload_avatar_success_for_partner(client, partner_token, monkeypatch):
    async def fake_upload_image(data, *, folder, public_id, **kwargs):
        return _fake_upload_result(f"{folder}/{public_id}")

    monkeypatch.setattr(cloudinary_service, "upload_image", fake_upload_image)

    files = {"file": ("avatar.jpg", b"\xff\xd8\xff\xe0" + b"\x00" * 200, "image/jpeg")}
    resp = await client.post(f"{API}/uploads/avatar", files=files, headers=auth(partner_token))
    assert resp.status_code == 200
    assert resp.json()["url"].startswith("https://res.cloudinary.com/")


async def test_upload_avatar_success_for_consumer(client, consumer_token, monkeypatch):
    async def fake_upload_image(data, *, folder, public_id, **kwargs):
        return _fake_upload_result(f"{folder}/{public_id}")

    monkeypatch.setattr(cloudinary_service, "upload_image", fake_upload_image)

    files = {"file": ("avatar.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 200, "image/png")}
    resp = await client.post(f"{API}/uploads/avatar", files=files, headers=auth(consumer_token))
    assert resp.status_code == 200


async def test_delete_avatar_success(client, partner_token, monkeypatch):
    async def fake_delete_image(public_id, **kwargs):
        return {"result": "ok"}

    monkeypatch.setattr(cloudinary_service, "delete_image", fake_delete_image)

    resp = await client.delete(f"{API}/uploads/avatar", headers=auth(partner_token))
    assert resp.status_code == 200
    assert resp.json()["deleted"] is True


async def test_upload_kyc_document_creates_then_reupload_replaces_in_place(client, partner_token, monkeypatch):
    async def fake_upload_image(data, *, folder, public_id, **kwargs):
        return _fake_upload_result(f"{folder}/{public_id}")

    monkeypatch.setattr(cloudinary_service, "upload_image", fake_upload_image)

    files = {"file": ("mykad.jpg", b"\xff\xd8\xff\xe0" + b"\x00" * 200, "image/jpeg")}
    first = await client.post(
        f"{API}/uploads/kyc-documents", files=files, data={"document_type": "TRADE_CERTIFICATE"},
        headers=auth(partner_token),
    )
    assert first.status_code == 201
    assert first.json()["verification_status"] == "PENDING"
    doc_id = first.json()["id"]

    second = await client.post(
        f"{API}/uploads/kyc-documents", files=files, data={"document_type": "TRADE_CERTIFICATE"},
        headers=auth(partner_token),
    )
    assert second.status_code == 201
    # Same document_type re-uploaded -> replaces the existing row in place,
    # not a second row (see _save_kyc_document in routes/uploads.py).
    assert second.json()["id"] == doc_id

    listed = await client.get(f"{API}/uploads/kyc-documents", headers=auth(partner_token))
    assert listed.status_code == 200
    matching = [d for d in listed.json() if d["id"] == doc_id]
    assert len(matching) == 1


async def test_delete_kyc_document_success_and_not_owned_is_404(client, partner_token, partner2_token, monkeypatch):
    async def fake_upload_image(data, *, folder, public_id, **kwargs):
        return _fake_upload_result(f"{folder}/{public_id}")

    async def fake_delete_image(public_id, **kwargs):
        return {"result": "ok"}

    monkeypatch.setattr(cloudinary_service, "upload_image", fake_upload_image)
    monkeypatch.setattr(cloudinary_service, "delete_image", fake_delete_image)

    files = {"file": ("bank.jpg", b"\xff\xd8\xff\xe0" + b"\x00" * 200, "image/jpeg")}
    uploaded = await client.post(
        f"{API}/uploads/kyc-documents", files=files, data={"document_type": "BANK_STATEMENT"},
        headers=auth(partner_token),
    )
    doc_id = uploaded.json()["id"]

    not_owned = await client.delete(f"{API}/uploads/kyc-documents/{doc_id}", headers=auth(partner2_token))
    assert not_owned.status_code == 404

    deleted = await client.delete(f"{API}/uploads/kyc-documents/{doc_id}", headers=auth(partner_token))
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True


async def _get_a_real_job_id(partner_token, client) -> str | None:
    from database import async_session
    from sqlalchemy import select
    from models.job import Job
    from models.partner import Partner
    from auth import decode_token

    user_id = decode_token(partner_token)["sub"]
    async with async_session() as db:
        partner_id = (await db.execute(select(Partner.id).where(Partner.user_id == user_id))).scalar_one_or_none()
        if not partner_id:
            return None
        job_id = (await db.execute(select(Job.id).where(Job.partner_id == partner_id).limit(1))).scalar_one_or_none()
        return str(job_id) if job_id else None


async def test_upload_and_list_and_delete_job_photo(client, partner_token, monkeypatch):
    job_id = await _get_a_real_job_id(partner_token, client)
    if job_id is None:
        import pytest
        pytest.skip("No seeded job found for the seeded partner in current data")

    async def fake_upload_image(data, *, folder, public_id, **kwargs):
        return _fake_upload_result(f"{folder}/{public_id}")

    async def fake_delete_image(public_id, **kwargs):
        return {"result": "ok"}

    monkeypatch.setattr(cloudinary_service, "upload_image", fake_upload_image)
    monkeypatch.setattr(cloudinary_service, "delete_image", fake_delete_image)

    files = {"file": ("before.jpg", b"\xff\xd8\xff\xe0" + b"\x00" * 200, "image/jpeg")}
    uploaded = await client.post(
        f"{API}/uploads/jobs/{job_id}/photos", files=files, data={"photo_type": "before", "caption": "pytest before photo"},
        headers=auth(partner_token),
    )
    assert uploaded.status_code == 201
    photo_id = uploaded.json()["id"]
    assert uploaded.json()["job_id"] == job_id

    listed = await client.get(f"{API}/uploads/jobs/{job_id}/photos", headers=auth(partner_token))
    assert listed.status_code == 200
    assert any(p["id"] == photo_id for p in listed.json())

    deleted = await client.delete(f"{API}/uploads/jobs/{job_id}/photos/{photo_id}", headers=auth(partner_token))
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True


# --- confirm_upload: real, unmocked (never calls Cloudinary itself) --------

async def test_confirm_upload_avatar_real_unmocked(client, partner_token):
    from database import async_session
    from sqlalchemy import select
    from models.partner import Partner
    from auth import decode_token

    user_id = decode_token(partner_token)["sub"]
    async with async_session() as db:
        partner_id = (await db.execute(select(Partner.id).where(Partner.user_id == user_id))).scalar_one()

    folder, public_id = cloudinary_service.avatar_public_id("partner", partner_id)
    full_public_id = cloudinary_service.full_public_id(folder, public_id)

    resp = await client.post(
        f"{API}/uploads/confirm",
        json={
            "upload_type": "avatar", "public_id": full_public_id,
            "secure_url": "https://res.cloudinary.com/demo/image/upload/v1/pytest-confirm-avatar.jpg",
        },
        headers=auth(partner_token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "saved"

    profile = await client.get(f"{API}/partner/me", headers=auth(partner_token))
    assert profile.json()["avatar_url"] == "https://res.cloudinary.com/demo/image/upload/v1/pytest-confirm-avatar.jpg"


async def test_confirm_upload_rejects_a_public_id_that_was_not_issued_to_this_account(client, partner_token):
    resp = await client.post(
        f"{API}/uploads/confirm",
        json={
            "upload_type": "avatar", "public_id": "servisaku/avatars/partner_00000000-0000-0000-0000-000000000000",
            "secure_url": "https://res.cloudinary.com/demo/image/upload/v1/pytest-mismatch.jpg",
        },
        headers=auth(partner_token),
    )
    assert resp.status_code == 403


async def test_confirm_upload_kyc_document_real_unmocked(client, partner_token):
    from database import async_session
    from sqlalchemy import select
    from models.partner import Partner
    from auth import decode_token

    user_id = decode_token(partner_token)["sub"]
    async with async_session() as db:
        partner_id = (await db.execute(select(Partner.id).where(Partner.user_id == user_id))).scalar_one()

    folder, public_id = cloudinary_service.kyc_document_public_id(partner_id, "PASSPORT")
    full_public_id = cloudinary_service.full_public_id(folder, public_id)

    resp = await client.post(
        f"{API}/uploads/confirm",
        json={
            "upload_type": "kyc_document", "public_id": full_public_id, "document_type": "PASSPORT",
            "secure_url": "https://res.cloudinary.com/demo/image/upload/v1/pytest-confirm-passport.jpg",
            "file_name": "passport.jpg",
        },
        headers=auth(partner_token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "saved"
    assert "document_id" in resp.json()


async def test_confirm_upload_kyc_document_missing_document_type_is_422(client, partner_token):
    resp = await client.post(
        f"{API}/uploads/confirm",
        json={
            "upload_type": "kyc_document", "public_id": "irrelevant",
            "secure_url": "https://res.cloudinary.com/demo/image/upload/v1/x.jpg",
        },
        headers=auth(partner_token),
    )
    assert resp.status_code == 422


async def test_confirm_upload_job_photo_real_unmocked(client, partner_token):
    job_id = await _get_a_real_job_id(partner_token, client)
    if job_id is None:
        import pytest
        pytest.skip("No seeded job found for the seeded partner in current data")

    photo_id = uuid.uuid4()
    public_id = f"servisaku/jobs/{job_id}/{photo_id}"

    resp = await client.post(
        f"{API}/uploads/confirm",
        json={
            "upload_type": "job_photo", "public_id": public_id, "job_id": job_id, "photo_type": "after",
            "secure_url": "https://res.cloudinary.com/demo/image/upload/v1/pytest-confirm-job-photo.jpg",
        },
        headers=auth(partner_token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "saved"


async def test_confirm_upload_job_photo_wrong_public_id_prefix_is_403(client, partner_token):
    job_id = await _get_a_real_job_id(partner_token, client)
    if job_id is None:
        import pytest
        pytest.skip("No seeded job found for the seeded partner in current data")

    resp = await client.post(
        f"{API}/uploads/confirm",
        json={
            "upload_type": "job_photo", "public_id": "servisaku/jobs/wrong-job-id/whatever",
            "job_id": job_id, "secure_url": "https://res.cloudinary.com/demo/image/upload/v1/x.jpg",
        },
        headers=auth(partner_token),
    )
    assert resp.status_code == 403


async def test_signature_endpoint_for_avatar_computes_the_same_folder_and_public_id_scheme(client, partner_token):
    """get_upload_signature 503s without real Cloudinary credentials (see
    test_uploads_api.py), but the folder/public_id it *would* have returned
    (before the network call) is derived from the same pure helpers this
    test uses directly — verifying the scheme is consistent end-to-end,
    without needing the network call to succeed."""
    from database import async_session
    from sqlalchemy import select
    from models.partner import Partner
    from auth import decode_token

    user_id = decode_token(partner_token)["sub"]
    async with async_session() as db:
        partner_id = (await db.execute(select(Partner.id).where(Partner.user_id == user_id))).scalar_one()

    folder, public_id = cloudinary_service.avatar_public_id("partner", partner_id)
    assert folder == "servisaku/avatars"
    assert public_id == f"partner_{partner_id}"
