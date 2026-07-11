"""Unit tests for services/rbac.py — the granular permission layer on top of
the coarse JWT `role` claim (see the module's own docstring). Calls
get_user_permissions/get_user_roles/require_permission/log_admin_action/
write_audit_log directly against the real (live) RBAC schema and admin log
tables — no mocking, since these are pure DB-backed functions with no
external provider dependency."""
import uuid

import pytest
from fastapi import HTTPException

from auth import decode_token
from database import async_session
from services.rbac import (
    FULL_ACCESS_PERMISSION, get_user_permissions, get_user_roles,
    log_admin_action, require_permission, write_audit_log,
)


def _user_id_from_token(token: str) -> uuid.UUID:
    return uuid.UUID(decode_token(token)["sub"])


async def test_get_user_permissions_is_empty_for_a_user_with_no_role_assignment():
    async with async_session() as db:
        perms = await get_user_permissions(db, uuid.uuid4())
        assert perms == set()


async def test_get_user_roles_is_empty_for_a_user_with_no_role_assignment():
    async with async_session() as db:
        roles = await get_user_roles(db, uuid.uuid4())
        assert roles == []


async def test_seeded_admin_has_full_access_permission(admin_token):
    """seed.py assigns SUPER_ADMIN to admin@servisaku.com (see
    seed_admin_rbac in seed.py) — this is a live-data assumption, matching
    the same convention test_dispatch_engine_flow.py uses for seeded
    addresses/services."""
    admin_user_id = _user_id_from_token(admin_token)
    async with async_session() as db:
        perms = await get_user_permissions(db, admin_user_id)
        if not perms:
            pytest.skip("Seeded admin has no RBAC role assignment in current data — run seed.py")
        assert FULL_ACCESS_PERMISSION in perms


async def test_require_permission_raises_403_for_a_user_with_no_roles():
    """Direct unit test of the require_permission(...) dependency's own
    check function, bypassing the FastAPI Depends() chain (which needs a
    real request) — this is the exact branch every admin-permission-gated
    route relies on when the caller lacks the specific permission."""
    checker = require_permission("some.permission.that.nobody.has")
    async with async_session() as db:
        with pytest.raises(HTTPException) as exc_info:
            await checker(admin_user_id=uuid.uuid4(), db=db)
        assert exc_info.value.status_code == 403


async def test_require_permission_allows_full_access_holder_regardless_of_the_specific_permission_name(admin_token):
    admin_user_id = _user_id_from_token(admin_token)
    async with async_session() as db:
        perms = await get_user_permissions(db, admin_user_id)
        if FULL_ACCESS_PERMISSION not in perms:
            pytest.skip("Seeded admin does not have admin.full_access in current data")

    checker = require_permission("a.permission.name.that.does.not.exist.in.the.seed.catalog")
    async with async_session() as db:
        result = await checker(admin_user_id=admin_user_id, db=db)
        assert result == admin_user_id


async def test_log_admin_action_writes_a_row_for_a_real_user(admin_token):
    admin_user_id = _user_id_from_token(admin_token)
    async with async_session() as db:
        await log_admin_action(db, admin_user_id, "pytest.unit_test_action", "test", uuid.uuid4(), "pytest rbac unit test")
        await db.commit()  # would raise if the insert silently failed to flush


async def test_log_admin_action_swallows_a_foreign_key_violation_instead_of_raising():
    """admin_user_id FKs to users.id, NOT NULL — a nonexistent user_id trips
    a real IntegrityError on flush. log_admin_action's bare except must
    swallow it, matching the "logging must never break the mutation it
    describes" contract in its own docstring."""
    bogus_user_id = uuid.uuid4()
    async with async_session() as db:
        await log_admin_action(db, bogus_user_id, "pytest.fk_violation_test", "test", None, None)
        # No assertion needed beyond "did not raise" — this session is
        # deliberately discarded (not committed) since the flush inside
        # log_admin_action already failed and was swallowed internally.


async def test_write_audit_log_writes_a_row_for_a_real_user(admin_token):
    admin_user_id = _user_id_from_token(admin_token)
    async with async_session() as db:
        await write_audit_log(
            db, admin_user_id, "pytest_entity", uuid.uuid4(), "pytest.unit_test",
            old_values={"status": "before"}, new_values={"status": "after"},
        )
        await db.commit()


async def test_write_audit_log_swallows_a_foreign_key_violation_instead_of_raising():
    bogus_user_id = uuid.uuid4()
    async with async_session() as db:
        await write_audit_log(db, bogus_user_id, "pytest_entity", uuid.uuid4(), "pytest.fk_violation_test")
