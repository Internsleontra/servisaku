"""Upload API tests — validation paths only (magic-byte sniffing, size limit),
which run before any Cloudinary network call, so they don't need real
Cloudinary credentials. A successful upload isn't exercised here — see
docs/TESTING_GUIDE.md "Known gaps"."""
from tests.conftest import API, auth


async def test_avatar_upload_rejects_non_image_content(client, partner_token):
    files = {"file": ("fake.jpg", b"this is plain text, not an image", "image/jpeg")}
    resp = await client.post(f"{API}/uploads/avatar", files=files, headers=auth(partner_token))
    assert resp.status_code == 422


async def test_avatar_upload_rejects_empty_file(client, partner_token):
    files = {"file": ("empty.jpg", b"", "image/jpeg")}
    resp = await client.post(f"{API}/uploads/avatar", files=files, headers=auth(partner_token))
    assert resp.status_code == 422


async def test_kyc_document_upload_rejects_non_image_content(client, partner_token):
    files = {"file": ("fake.jpg", b"not a real image at all", "image/jpeg")}
    resp = await client.post(
        f"{API}/uploads/kyc-documents", files=files, data={"document_type": "MYKAD_FRONT"}, headers=auth(partner_token),
    )
    assert resp.status_code == 422


async def test_list_kyc_documents(client, partner_token):
    resp = await client.get(f"{API}/uploads/kyc-documents", headers=auth(partner_token))
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_avatar_upload_requires_auth(client):
    files = {"file": ("fake.jpg", b"\xff\xd8\xff" + b"\x00" * 50, "image/jpeg")}
    resp = await client.post(f"{API}/uploads/avatar", files=files)
    assert resp.status_code == 401


async def test_job_photo_upload_rejects_non_image_for_nonexistent_job(client, partner_token):
    # Ownership check runs before the image-content check, so a bogus job_id
    # correctly 404s even though the "file" itself is also invalid.
    files = {"file": ("fake.jpg", b"not a real image", "image/jpeg")}
    resp = await client.post(
        f"{API}/uploads/jobs/00000000-0000-0000-0000-000000000000/photos",
        files=files, data={"photo_type": "before"}, headers=auth(partner_token),
    )
    assert resp.status_code == 404


async def test_list_job_photos_for_nonexistent_job_is_404(client, partner_token):
    resp = await client.get(
        f"{API}/uploads/jobs/00000000-0000-0000-0000-000000000000/photos", headers=auth(partner_token),
    )
    assert resp.status_code == 404


async def test_signature_endpoint_requires_document_type_for_kyc_document(client, partner_token):
    resp = await client.post(
        f"{API}/uploads/signature", json={"upload_type": "kyc_document"}, headers=auth(partner_token),
    )
    assert resp.status_code == 422


async def test_signature_endpoint_rejects_consumer_requesting_kyc_document(client, consumer_token):
    resp = await client.post(
        f"{API}/uploads/signature",
        json={"upload_type": "kyc_document", "document_type": "MYKAD_FRONT"},
        headers=auth(consumer_token),
    )
    assert resp.status_code == 403


async def test_signature_endpoint_fails_cleanly_without_cloudinary_credentials(client, partner_token):
    resp = await client.post(
        f"{API}/uploads/signature", json={"upload_type": "avatar"}, headers=auth(partner_token),
    )
    # Cloudinary isn't configured in this environment — must be a clean 503,
    # never a 500 and never a fake signature.
    assert resp.status_code == 503
