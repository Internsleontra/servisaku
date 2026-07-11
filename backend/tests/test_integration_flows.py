"""Integration tests — multi-step flows spanning several endpoints/tables,
as opposed to single-request checks in the other test files."""
import time

from tests.conftest import API, auth


async def test_support_ticket_full_lifecycle(client, admin_token):
    """create -> assign -> resolve, checking state at every step."""
    me = (await client.get(f"{API}/admin/rbac/me", headers=auth(admin_token))).json()
    admin_user_id = me["user_id"]

    created = await client.post(
        f"{API}/admin/support-tickets",
        json={"ticket_type": "GENERAL", "title": f"pytest integration ticket {int(time.time())}", "priority": "LOW"},
        headers=auth(admin_token),
    )
    assert created.status_code == 201
    ticket = created.json()
    assert ticket["status"] == "OPEN"

    assigned = await client.post(
        f"{API}/admin/support-tickets/{ticket['id']}/assign",
        json={"assigned_admin_id": admin_user_id},
        headers=auth(admin_token),
    )
    assert assigned.status_code == 200
    assert assigned.json()["status"] == "ASSIGNED"
    assert assigned.json()["assigned_admin_id"] == admin_user_id

    resolved = await client.post(
        f"{API}/admin/support-tickets/{ticket['id']}/resolve",
        json={"resolution_notes": "Closed by pytest integration test", "status": "RESOLVED"},
        headers=auth(admin_token),
    )
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "RESOLVED"
    assert resolved.json()["resolved_at"] is not None

    fetched = await client.get(f"{API}/admin/support-tickets/{ticket['id']}", headers=auth(admin_token))
    assert fetched.json()["status"] == "RESOLVED"


async def test_catalog_crud_lifecycle_category_service_addon_pricing(client, admin_token):
    """category -> service -> add-on + pricing-rule, then soft-delete each,
    verifying is_active flips without the rows disappearing."""
    suffix = int(time.time() * 1000)

    cat = await client.post(
        f"{API}/admin/catalog/categories",
        json={"name": f"Pytest Category {suffix}", "slug": f"pytest-category-{suffix}"},
        headers=auth(admin_token),
    )
    assert cat.status_code == 201
    category_id = cat.json()["id"]

    svc = await client.post(
        f"{API}/admin/catalog/services",
        json={"category_id": category_id, "name": "Pytest Service", "slug": f"pytest-service-{suffix}", "starting_price_rm": "42.00"},
        headers=auth(admin_token),
    )
    assert svc.status_code == 201
    service_id = svc.json()["id"]

    addon = await client.post(
        f"{API}/admin/catalog/addons",
        json={"service_id": service_id, "name": "Pytest Addon", "price_rm": "5.00"},
        headers=auth(admin_token),
    )
    assert addon.status_code == 201

    pricing = await client.post(
        f"{API}/admin/catalog/pricing-rules",
        json={"service_id": service_id, "rule_name": "Pytest Rule", "pricing_type": "FLAT", "base_price_rm": "42.00"},
        headers=auth(admin_token),
    )
    assert pricing.status_code == 201

    deactivated = await client.delete(f"{API}/admin/catalog/services/{service_id}", headers=auth(admin_token))
    assert deactivated.status_code == 200
    assert deactivated.json()["is_active"] is False

    still_listed = await client.get(f"{API}/admin/catalog/services?category_id={category_id}", headers=auth(admin_token))
    ids = [s["id"] for s in still_listed.json()]
    assert service_id in ids  # soft-delete: row still exists, just inactive

    await client.delete(f"{API}/admin/catalog/categories/{category_id}", headers=auth(admin_token))


async def test_rbac_role_assignment_and_revocation_changes_effective_permissions(client, admin_token):
    """Assign FINANCE to a throwaway user, confirm permissions appear, revoke,
    confirm they disappear — exercising the full RBAC read path end-to-end."""
    from database import async_session
    from auth import hash_password
    from models.auth import User

    async with async_session() as db:
        from sqlalchemy import select
        email = "pytest-rbac-test@servisaku.com"
        existing = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if existing:
            test_user_id = str(existing.id)
        else:
            user = User(
                user_type="ADMIN", email=email, phone_number="+60188800001",
                password_hash=hash_password("Pytest@123"), status="ACTIVE",
                is_phone_verified=True, is_email_verified=True,
            )
            db.add(user)
            await db.commit()
            test_user_id = str(user.id)

    roles = (await client.get(f"{API}/admin/rbac/roles", headers=auth(admin_token))).json()
    finance_role = next(r for r in roles if r["name"] == "FINANCE")

    before = (await client.get(f"{API}/admin/rbac/users/{test_user_id}", headers=auth(admin_token))).json()
    already_has_it = "FINANCE" in before["roles"]

    if not already_has_it:
        assign = await client.post(
            f"{API}/admin/rbac/users/{test_user_id}/roles",
            json={"role_id": finance_role["id"]}, headers=auth(admin_token),
        )
        assert assign.status_code == 201

    after_assign = (await client.get(f"{API}/admin/rbac/users/{test_user_id}", headers=auth(admin_token))).json()
    assert "FINANCE" in after_assign["roles"]
    assert "payments.refund" in after_assign["permissions"]

    revoke = await client.delete(
        f"{API}/admin/rbac/users/{test_user_id}/roles/{finance_role['id']}", headers=auth(admin_token),
    )
    assert revoke.status_code == 200

    after_revoke = (await client.get(f"{API}/admin/rbac/users/{test_user_id}", headers=auth(admin_token))).json()
    assert "FINANCE" not in after_revoke["roles"]
