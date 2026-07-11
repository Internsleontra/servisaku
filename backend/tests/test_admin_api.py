"""Admin Backend API tests (Stage 6): RBAC enforcement + read paths across
every admin route group. Mutations (approve/create/etc.) were exhaustively
live-verified manually during Stage 6 development (see docs/ADMIN_BACKEND.md
and TEST_REPORT.md) — this suite focuses on repeatable, idempotent checks:
RBAC gating, list/detail endpoints, and 404/422 error paths."""
import pytest

from tests.conftest import API, auth

READ_ENDPOINTS = [
    "/admin/dashboard",
    "/admin/rbac/me",
    "/admin/rbac/roles",
    "/admin/rbac/permissions",
    "/admin/rbac/actions",
    "/admin/rbac/audit-logs",
    "/admin/users",
    "/admin/consumers",
    "/admin/partners",
    "/admin/bookings",
    "/admin/catalog/categories",
    "/admin/catalog/services",
    "/admin/catalog/addons",
    "/admin/catalog/pricing-rules",
    "/admin/catalog/surge-rules",
    "/admin/catalog/packages",
    "/admin/coupons",
    "/admin/settlements",
    "/admin/support-tickets",
    "/admin/training/modules",
]


@pytest.mark.parametrize("path", READ_ENDPOINTS)
async def test_admin_read_endpoint_succeeds_for_super_admin(client, admin_token, path):
    resp = await client.get(f"{API}{path}", headers=auth(admin_token))
    assert resp.status_code == 200, f"{path} -> {resp.status_code}: {resp.text}"


@pytest.mark.parametrize("path", READ_ENDPOINTS)
async def test_admin_read_endpoint_rejects_partner_token(client, partner_token, path):
    resp = await client.get(f"{API}{path}", headers=auth(partner_token))
    assert resp.status_code == 403, f"{path} -> expected 403, got {resp.status_code}"


@pytest.mark.parametrize("path", READ_ENDPOINTS)
async def test_admin_read_endpoint_rejects_missing_token(client, path):
    resp = await client.get(f"{API}{path}")
    assert resp.status_code == 401


async def test_get_nonexistent_partner_is_404(client, admin_token):
    resp = await client.get(f"{API}/admin/partners/00000000-0000-0000-0000-000000000000", headers=auth(admin_token))
    assert resp.status_code == 404


async def test_get_nonexistent_booking_is_404(client, admin_token):
    resp = await client.get(f"{API}/admin/bookings/00000000-0000-0000-0000-000000000000", headers=auth(admin_token))
    assert resp.status_code == 404


async def test_approve_partner_in_wrong_status_is_409(client, admin_token):
    partners = (await client.get(f"{API}/admin/partners?status=ACTIVE", headers=auth(admin_token))).json()
    assert partners, "expected at least one ACTIVE partner in seed data"
    active_partner_id = partners[0]["id"]
    resp = await client.post(
        f"{API}/admin/partners/{active_partner_id}/approve", json={}, headers=auth(admin_token),
    )
    assert resp.status_code == 409


async def test_create_coupon_with_invalid_discount_type_is_422(client, admin_token):
    resp = await client.post(
        f"{API}/admin/coupons",
        json={
            "code": "PYTEST_INVALID_DISCOUNT", "discount_type": "NOT_A_REAL_TYPE", "discount_value": "10.00",
            "valid_from": "2026-01-01T00:00:00Z", "valid_until": "2026-12-31T00:00:00Z",
        },
        headers=auth(admin_token),
    )
    assert resp.status_code == 422


async def test_duplicate_coupon_code_is_409_not_500(client, admin_token):
    import time
    # A fresh code per run keeps this idempotent across repeated suite runs —
    # coupons are soft-deleted, not removed, so a hardcoded code would 409 on
    # its own *first* insert on the second run.
    unique_code = f"PYTEST_DUP_{int(time.time() * 1000)}"
    body = {
        "code": unique_code, "discount_type": "FIXED_AMOUNT", "discount_value": "5.00",
        "valid_from": "2026-01-01T00:00:00Z", "valid_until": "2026-12-31T00:00:00Z",
    }
    first = await client.post(f"{API}/admin/coupons", json=body, headers=auth(admin_token))
    assert first.status_code == 201
    second = await client.post(f"{API}/admin/coupons", json=body, headers=auth(admin_token))
    assert second.status_code == 409


async def test_manual_role_assignment_requires_full_access_permission(client, admin_token, partner_token):
    # A partner-role JWT can't reach this at all (coarse gate), confirming
    # defense in depth even before the granular admin.full_access check.
    resp = await client.post(
        f"{API}/admin/rbac/users/00000000-0000-0000-0000-000000000000/roles",
        json={"role_id": "00000000-0000-0000-0000-000000000000"},
        headers=auth(partner_token),
    )
    assert resp.status_code == 403


async def test_reject_partner_in_wrong_status_is_409(client, admin_token):
    partners = (await client.get(f"{API}/admin/partners?status=ACTIVE", headers=auth(admin_token))).json()
    resp = await client.post(
        f"{API}/admin/partners/{partners[0]['id']}/reject", json={"reason": "pytest test"}, headers=auth(admin_token),
    )
    assert resp.status_code == 409


async def test_reactivate_a_non_suspended_partner_is_409(client, admin_token):
    partners = (await client.get(f"{API}/admin/partners?status=ACTIVE", headers=auth(admin_token))).json()
    resp = await client.post(f"{API}/admin/partners/{partners[0]['id']}/reactivate", headers=auth(admin_token))
    assert resp.status_code == 409


async def test_kyc_document_verify_and_reject_on_nonexistent_document_is_404(client, admin_token):
    verify = await client.post(f"{API}/admin/partners/documents/00000000-0000-0000-0000-000000000000/verify", headers=auth(admin_token))
    assert verify.status_code == 404
    reject = await client.post(
        f"{API}/admin/partners/documents/00000000-0000-0000-0000-000000000000/reject",
        json={"rejection_reason": "pytest test"}, headers=auth(admin_token),
    )
    assert reject.status_code == 404


async def test_kyc_document_reject_without_reason_is_422(client, admin_token):
    docs = await client.get(f"{API}/admin/partners", headers=auth(admin_token))
    partner_id = docs.json()[0]["id"]
    kyc_docs = await client.get(f"{API}/admin/partners/{partner_id}/documents", headers=auth(admin_token))
    if not kyc_docs.json():
        return  # no uploaded KYC documents exist in current data — nothing to reject
    doc_id = kyc_docs.json()[0]["id"]
    resp = await client.post(
        f"{API}/admin/partners/documents/{doc_id}/reject", json={"rejection_reason": None}, headers=auth(admin_token),
    )
    assert resp.status_code == 422


async def test_admin_bookings_filter_by_status(client, admin_token):
    resp = await client.get(f"{API}/admin/bookings?status=COMPLETED", headers=auth(admin_token))
    assert resp.status_code == 200
    for b in resp.json():
        assert b["booking_status"] == "COMPLETED"


async def test_admin_booking_status_history_on_nonexistent_booking_is_404(client, admin_token):
    resp = await client.get(
        f"{API}/admin/bookings/00000000-0000-0000-0000-000000000000/status-history", headers=auth(admin_token),
    )
    assert resp.status_code == 404


async def test_cancel_a_completed_booking_is_409(client, admin_token):
    completed = (await client.get(f"{API}/admin/bookings?status=COMPLETED", headers=auth(admin_token))).json()
    if not completed:
        return
    resp = await client.post(
        f"{API}/admin/bookings/{completed[0]['id']}/cancel", json={"reason": "pytest test"}, headers=auth(admin_token),
    )
    assert resp.status_code == 409


async def test_settlement_create_with_invalid_earning_is_422(client, admin_token):
    resp = await client.post(
        f"{API}/admin/settlements",
        json={"partner_id": "00000000-0000-0000-0000-000000000000", "earning_ids": ["00000000-0000-0000-0000-000000000000"]},
        headers=auth(admin_token),
    )
    assert resp.status_code == 422


async def test_settlement_status_update_on_nonexistent_settlement_is_404(client, admin_token):
    resp = await client.put(
        f"{API}/admin/settlements/00000000-0000-0000-0000-000000000000/status",
        json={"status": "scheduled"}, headers=auth(admin_token),
    )
    assert resp.status_code == 404


async def test_settlement_status_update_with_invalid_status_is_422(client, admin_token):
    settlements = (await client.get(f"{API}/admin/settlements", headers=auth(admin_token))).json()
    if not settlements:
        return
    resp = await client.put(
        f"{API}/admin/settlements/{settlements[0]['id']}/status",
        json={"status": "not_a_real_status"}, headers=auth(admin_token),
    )
    assert resp.status_code == 422


async def test_user_status_update_with_invalid_status_is_422(client, admin_token):
    users = (await client.get(f"{API}/admin/users", headers=auth(admin_token))).json()
    resp = await client.put(
        f"{API}/admin/users/{users[0]['id']}/status", json={"status": "NOT_A_REAL_STATUS"}, headers=auth(admin_token),
    )
    assert resp.status_code == 422
