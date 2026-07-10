from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import get_current_admin_id
from models.rbac import Role, Permission, RolePermission, UserRole
from models.admin_log import AdminAction, AuditLog
from schemas.admin import (
    RoleResponse, PermissionResponse, AssignRoleRequest, UserRoleResponse,
    MyPermissionsResponse, AdminActionResponse, AuditLogResponse,
)
from services.rbac import get_user_permissions, get_user_roles, require_permission, log_admin_action

router = APIRouter(prefix="/admin/rbac", tags=["Admin - RBAC"])


@router.get(
    "/roles",
    response_model=list[RoleResponse],
    summary="List all roles with their permissions",
    description="**Database tables:** `roles`, `role_permissions`, `permissions`\n\n**Permissions:** Requires JWT token (role: admin)",
)
async def list_roles(
    _admin_id: UUID = Depends(get_current_admin_id),
    db: AsyncSession = Depends(get_db),
):
    roles = (await db.execute(select(Role).order_by(Role.name))).scalars().all()
    results = []
    for role in roles:
        stmt = select(Permission.name).join(RolePermission, RolePermission.permission_id == Permission.id).where(RolePermission.role_id == role.id)
        perms = (await db.execute(stmt)).scalars().all()
        results.append(RoleResponse(id=role.id, name=role.name, description=role.description, permissions=sorted(perms)))
    return results


@router.get(
    "/permissions",
    response_model=list[PermissionResponse],
    summary="List all permissions",
    description="**Database tables:** `permissions`\n\n**Permissions:** Requires JWT token (role: admin)",
)
async def list_permissions(
    _admin_id: UUID = Depends(get_current_admin_id),
    db: AsyncSession = Depends(get_db),
):
    perms = (await db.execute(select(Permission).order_by(Permission.name))).scalars().all()
    return [PermissionResponse.model_validate(p) for p in perms]


@router.get(
    "/me",
    response_model=MyPermissionsResponse,
    summary="My own roles and effective permissions",
    description="**Database tables:** `user_roles`, `roles`, `role_permissions`, `permissions`\n\n**Permissions:** Requires JWT token (role: admin)",
)
async def my_permissions(
    admin_id: UUID = Depends(get_current_admin_id),
    db: AsyncSession = Depends(get_db),
):
    roles = await get_user_roles(db, admin_id)
    perms = await get_user_permissions(db, admin_id)
    return MyPermissionsResponse(user_id=admin_id, roles=roles, permissions=sorted(perms))


@router.get(
    "/users/{user_id}",
    response_model=UserRoleResponse,
    summary="Get a user's assigned roles and effective permissions",
    description="**Database tables:** `user_roles`, `roles`, `role_permissions`, `permissions`\n\n**Permissions:** Requires JWT token (role: admin)",
)
async def get_user_rbac(
    user_id: UUID,
    _admin_id: UUID = Depends(get_current_admin_id),
    db: AsyncSession = Depends(get_db),
):
    roles = await get_user_roles(db, user_id)
    perms = await get_user_permissions(db, user_id)
    return UserRoleResponse(user_id=user_id, roles=roles, permissions=sorted(perms))


@router.post(
    "/users/{user_id}/roles",
    status_code=201,
    summary="Assign a role to a user",
    description=(
        "Grants a user one of the 7 pre-defined roles (SUPER_ADMIN, OPS_MANAGER, "
        "FINANCE, SUPPORT_AGENT, READ_ONLY, PARTNER, CONSUMER), each carrying a "
        "fixed set of permissions.\n\n"
        "**Database tables:** `user_roles`\n\n"
        "**Permissions:** Requires JWT token (role: admin, permission: `admin.full_access`)"
    ),
    responses={404: {"description": "Role not found"}, 409: {"description": "User already has this role"}},
)
async def assign_role(
    user_id: UUID,
    body: AssignRoleRequest,
    admin_id: UUID = Depends(require_permission("admin.full_access")),
    db: AsyncSession = Depends(get_db),
):
    role = await db.get(Role, body.role_id)
    if not role:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
    existing = (await db.execute(
        select(UserRole).where(UserRole.user_id == user_id, UserRole.role_id == body.role_id)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "User already has this role")

    db.add(UserRole(user_id=user_id, role_id=body.role_id))
    await log_admin_action(db, admin_id, "rbac.role_assigned", "user", user_id, f"Assigned role {role.name}")
    await db.flush()
    return {"user_id": str(user_id), "role": role.name, "assigned": True}


@router.delete(
    "/users/{user_id}/roles/{role_id}",
    summary="Revoke a role from a user",
    description="**Database tables:** `user_roles`\n\n**Permissions:** Requires JWT token (role: admin, permission: `admin.full_access`)",
    responses={404: {"description": "User does not have this role"}},
)
async def revoke_role(
    user_id: UUID,
    role_id: UUID,
    admin_id: UUID = Depends(require_permission("admin.full_access")),
    db: AsyncSession = Depends(get_db),
):
    existing = (await db.execute(
        select(UserRole).where(UserRole.user_id == user_id, UserRole.role_id == role_id)
    )).scalar_one_or_none()
    if not existing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User does not have this role")
    await db.delete(existing)
    await log_admin_action(db, admin_id, "rbac.role_revoked", "user", user_id, f"Revoked role_id {role_id}")
    await db.flush()
    return {"user_id": str(user_id), "role_id": str(role_id), "revoked": True}


@router.get(
    "/actions",
    response_model=list[AdminActionResponse],
    summary="Admin action log",
    description=(
        "One line per admin mutation across every admin endpoint (approvals, "
        "role changes, catalog edits, etc.) — see also `/admin/rbac/audit-logs` "
        "for structured before/after values on the most sensitive mutations.\n\n"
        "**Database tables:** `admin_actions`\n\n"
        "**Permissions:** Requires JWT token (role: admin, permission: `reports.read`)"
    ),
)
async def list_admin_actions(
    _admin_id: UUID = Depends(require_permission("reports.read")),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
    action_type: str | None = Query(default=None),
):
    stmt = select(AdminAction).order_by(AdminAction.created_at.desc())
    if action_type:
        stmt = stmt.where(AdminAction.action_type == action_type)
    stmt = stmt.limit(limit).offset(offset)
    rows = (await db.execute(stmt)).scalars().all()
    return [AdminActionResponse.model_validate(r) for r in rows]


@router.get(
    "/audit-logs",
    response_model=list[AuditLogResponse],
    summary="Structured audit log (before/after values)",
    description="**Database tables:** `audit_logs`\n\n**Permissions:** Requires JWT token (role: admin, permission: `reports.read`)",
)
async def list_audit_logs(
    _admin_id: UUID = Depends(require_permission("reports.read")),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
    entity_type: str | None = Query(default=None),
):
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc())
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    stmt = stmt.limit(limit).offset(offset)
    rows = (await db.execute(stmt)).scalars().all()
    return [AuditLogResponse.model_validate(r) for r in rows]
