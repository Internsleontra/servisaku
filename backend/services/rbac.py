"""Wires up the pre-existing, pre-seeded RBAC schema (roles/permissions/
role_permissions/user_roles) that no code touched before this stage —
user_roles had 0 rows in the live database when Stage 6 began. Coarse
admin/partner/consumer gating (auth.get_current_admin_id, JWT `role` claim)
is unchanged and still the first gate; this module adds a second, granular
layer on top of it for admin endpoints, matching the permission catalog
already seeded in `permissions` (e.g. `partners.approve`, `coupons.manage`).
"""
import uuid
from typing import Callable
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_admin_id
from database import get_db
from models.rbac import Role, Permission, RolePermission, UserRole
from models.admin_log import AdminAction, AuditLog

FULL_ACCESS_PERMISSION = "admin.full_access"


async def get_user_permissions(db: AsyncSession, user_id: UUID) -> set[str]:
    """Effective permission set for a user, via user_roles -> roles ->
    role_permissions -> permissions. A user with no user_roles row (i.e. not
    yet assigned a granular role) has an empty set — even if their JWT role
    is "admin"."""
    stmt = (
        select(Permission.name)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(Role, Role.id == RolePermission.role_id)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user_id)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return set(rows)


async def get_user_roles(db: AsyncSession, user_id: UUID) -> list[str]:
    stmt = select(Role.name).join(UserRole, UserRole.role_id == Role.id).where(UserRole.user_id == user_id)
    return list((await db.execute(stmt)).scalars().all())


def require_permission(permission_name: str) -> Callable:
    """Dependency factory: gate an endpoint behind both the coarse `role:
    admin` JWT claim and a specific granular permission (or admin.full_access,
    which SUPER_ADMIN carries)."""

    async def _check(
        admin_user_id: UUID = Depends(get_current_admin_id),
        db: AsyncSession = Depends(get_db),
    ) -> UUID:
        perms = await get_user_permissions(db, admin_user_id)
        if permission_name not in perms and FULL_ACCESS_PERMISSION not in perms:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Missing required permission: {permission_name}",
            )
        return admin_user_id

    return _check


async def log_admin_action(
    db: AsyncSession,
    admin_user_id: UUID,
    action_type: str,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
    description: str | None = None,
) -> None:
    """Single-line action log (admin_actions) — best-effort, never raises, so
    a logging failure can never break the mutation it's describing."""
    try:
        db.add(AdminAction(
            admin_user_id=admin_user_id, action_type=action_type,
            target_type=target_type, target_id=target_id, description=description,
        ))
        await db.flush()
    except Exception:
        pass


async def write_audit_log(
    db: AsyncSession,
    user_id: uuid.UUID | None,
    entity_type: str,
    entity_id: uuid.UUID | None,
    action: str,
    old_values: dict | None = None,
    new_values: dict | None = None,
) -> None:
    """Structured before/after change record (audit_logs) — best-effort, never
    raises."""
    try:
        db.add(AuditLog(
            user_id=user_id, entity_type=entity_type, entity_id=entity_id, action=action,
            old_values=old_values, new_values=new_values,
        ))
        await db.flush()
    except Exception:
        pass
