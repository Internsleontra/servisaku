from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.catalog import ServiceCategory, Service, ServiceAddon, PricingRule, SurgePricingRule
from models.subscription import Subscription, SUBSCRIPTION_STATUS_VALUES
from schemas.catalog_admin import (
    ServiceCategoryCreate, ServiceCategoryUpdate, ServiceCategoryResponse,
    ServiceCreate, ServiceUpdate, ServiceResponse,
    ServiceAddonCreate, ServiceAddonUpdate, ServiceAddonResponse,
    PricingRuleCreate, PricingRuleUpdate, PricingRuleResponse,
    SurgePricingRuleCreate, SurgePricingRuleUpdate, SurgePricingRuleResponse,
    PackageResponse, PackageStatusUpdateRequest,
)
from services.rbac import require_permission, log_admin_action, write_audit_log

router = APIRouter(prefix="/admin/catalog", tags=["Admin - Catalog"])

_PERM = "pricing.manage"


# --- Service Categories ---

@router.get("/categories", response_model=list[ServiceCategoryResponse], summary="List service categories",
    description="**Database tables:** `service_categories`\n\n**Permissions:** Requires JWT token (role: admin, permission: `pricing.manage`)")
async def list_categories(_admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(ServiceCategory).order_by(ServiceCategory.display_order))).scalars().all()
    return [ServiceCategoryResponse.model_validate(r) for r in rows]


@router.post("/categories", response_model=ServiceCategoryResponse, status_code=201, summary="Create a service category",
    description="**Database tables:** `service_categories`\n\n**Permissions:** Requires JWT token (role: admin, permission: `pricing.manage`)")
async def create_category(body: ServiceCategoryCreate, admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    row = ServiceCategory(**body.model_dump())
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "A category with this name or slug already exists")
    await log_admin_action(db, admin_id, "catalog.category_created", "service_category", row.id, row.name)
    return ServiceCategoryResponse.model_validate(row)


@router.put("/categories/{category_id}", response_model=ServiceCategoryResponse, summary="Update a service category",
    description="**Database tables:** `service_categories`, `audit_logs`\n\n**Permissions:** Requires JWT token (role: admin, permission: `pricing.manage`)",
    responses={404: {"description": "Category not found"}})
async def update_category(category_id: UUID, body: ServiceCategoryUpdate, admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    row = await db.get(ServiceCategory, category_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    changes = body.model_dump(exclude_unset=True)
    old = {k: getattr(row, k) for k in changes}
    for k, v in changes.items():
        setattr(row, k, v)
    await write_audit_log(db, admin_id, "service_category", category_id, "update", old, changes)
    await db.flush()
    return ServiceCategoryResponse.model_validate(row)


@router.delete("/categories/{category_id}", summary="Deactivate a service category (soft delete)",
    description="Sets `is_active=false` — never hard-deletes, since services may reference it.\n\n**Database tables:** `service_categories`\n\n**Permissions:** Requires JWT token (role: admin, permission: `pricing.manage`)",
    responses={404: {"description": "Category not found"}})
async def deactivate_category(category_id: UUID, admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    row = await db.get(ServiceCategory, category_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    row.is_active = False
    await log_admin_action(db, admin_id, "catalog.category_deactivated", "service_category", category_id, None)
    await db.flush()
    return {"id": str(category_id), "is_active": False}


# --- Services ---

@router.get("/services", response_model=list[ServiceResponse], summary="List services",
    description="**Database tables:** `services`\n\n**Permissions:** Requires JWT token (role: admin, permission: `pricing.manage`)")
async def list_services(
    _admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db),
    category_id: UUID | None = Query(default=None),
):
    stmt = select(Service).order_by(Service.name)
    if category_id:
        stmt = stmt.where(Service.category_id == category_id)
    rows = (await db.execute(stmt)).scalars().all()
    return [ServiceResponse.model_validate(r) for r in rows]


@router.post("/services", response_model=ServiceResponse, status_code=201, summary="Create a service",
    description="**Database tables:** `services`\n\n**Permissions:** Requires JWT token (role: admin, permission: `pricing.manage`)",
    responses={404: {"description": "Category not found"}})
async def create_service(body: ServiceCreate, admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    if not await db.get(ServiceCategory, body.category_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    row = Service(**body.model_dump())
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "A service with this slug already exists")
    await log_admin_action(db, admin_id, "catalog.service_created", "service", row.id, row.name)
    return ServiceResponse.model_validate(row)


@router.put("/services/{service_id}", response_model=ServiceResponse, summary="Update a service",
    description="**Database tables:** `services`, `audit_logs`\n\n**Permissions:** Requires JWT token (role: admin, permission: `pricing.manage`)",
    responses={404: {"description": "Service not found"}})
async def update_service(service_id: UUID, body: ServiceUpdate, admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    row = await db.get(Service, service_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")
    changes = body.model_dump(exclude_unset=True)
    old = {k: getattr(row, k) for k in changes}
    for k, v in changes.items():
        setattr(row, k, v)
    await write_audit_log(db, admin_id, "service", service_id, "update", old, changes)
    await db.flush()
    return ServiceResponse.model_validate(row)


@router.delete("/services/{service_id}", summary="Deactivate a service (soft delete)",
    description="**Database tables:** `services`\n\n**Permissions:** Requires JWT token (role: admin, permission: `pricing.manage`)",
    responses={404: {"description": "Service not found"}})
async def deactivate_service(service_id: UUID, admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    row = await db.get(Service, service_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")
    row.is_active = False
    await log_admin_action(db, admin_id, "catalog.service_deactivated", "service", service_id, None)
    await db.flush()
    return {"id": str(service_id), "is_active": False}


# --- Service Add-ons ---

@router.get("/addons", response_model=list[ServiceAddonResponse], summary="List service add-ons",
    description="**Database tables:** `service_addons`\n\n**Permissions:** Requires JWT token (role: admin, permission: `pricing.manage`)")
async def list_addons(
    _admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db),
    service_id: UUID | None = Query(default=None),
):
    stmt = select(ServiceAddon)
    if service_id:
        stmt = stmt.where(ServiceAddon.service_id == service_id)
    rows = (await db.execute(stmt)).scalars().all()
    return [ServiceAddonResponse.model_validate(r) for r in rows]


@router.post("/addons", response_model=ServiceAddonResponse, status_code=201, summary="Create a service add-on",
    description="**Database tables:** `service_addons`\n\n**Permissions:** Requires JWT token (role: admin, permission: `pricing.manage`)",
    responses={404: {"description": "Service not found"}})
async def create_addon(body: ServiceAddonCreate, admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    if not await db.get(Service, body.service_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")
    row = ServiceAddon(**body.model_dump())
    db.add(row)
    await db.flush()
    await log_admin_action(db, admin_id, "catalog.addon_created", "service_addon", row.id, row.name)
    return ServiceAddonResponse.model_validate(row)


@router.put("/addons/{addon_id}", response_model=ServiceAddonResponse, summary="Update a service add-on",
    description="**Database tables:** `service_addons`\n\n**Permissions:** Requires JWT token (role: admin, permission: `pricing.manage`)",
    responses={404: {"description": "Add-on not found"}})
async def update_addon(addon_id: UUID, body: ServiceAddonUpdate, admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    row = await db.get(ServiceAddon, addon_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Add-on not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await db.flush()
    return ServiceAddonResponse.model_validate(row)


@router.delete("/addons/{addon_id}", summary="Deactivate a service add-on",
    description="**Database tables:** `service_addons`\n\n**Permissions:** Requires JWT token (role: admin, permission: `pricing.manage`)",
    responses={404: {"description": "Add-on not found"}})
async def deactivate_addon(addon_id: UUID, admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    row = await db.get(ServiceAddon, addon_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Add-on not found")
    row.is_active = False
    await db.flush()
    return {"id": str(addon_id), "is_active": False}


# --- Pricing Rules ---

@router.get("/pricing-rules", response_model=list[PricingRuleResponse], summary="List pricing rules",
    description="**Database tables:** `pricing_rules`\n\n**Permissions:** Requires JWT token (role: admin, permission: `pricing.manage`)")
async def list_pricing_rules(
    _admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db),
    service_id: UUID | None = Query(default=None),
):
    stmt = select(PricingRule)
    if service_id:
        stmt = stmt.where(PricingRule.service_id == service_id)
    rows = (await db.execute(stmt)).scalars().all()
    return [PricingRuleResponse.model_validate(r) for r in rows]


@router.post("/pricing-rules", response_model=PricingRuleResponse, status_code=201, summary="Create a pricing rule",
    description="**Database tables:** `pricing_rules`\n\n**Permissions:** Requires JWT token (role: admin, permission: `pricing.manage`)",
    responses={404: {"description": "Service not found"}})
async def create_pricing_rule(body: PricingRuleCreate, admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    if not await db.get(Service, body.service_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")
    row = PricingRule(**body.model_dump())
    db.add(row)
    await db.flush()
    await log_admin_action(db, admin_id, "catalog.pricing_rule_created", "pricing_rule", row.id, row.rule_name)
    return PricingRuleResponse.model_validate(row)


@router.put("/pricing-rules/{rule_id}", response_model=PricingRuleResponse, summary="Update a pricing rule",
    description="**Database tables:** `pricing_rules`, `audit_logs`\n\n**Permissions:** Requires JWT token (role: admin, permission: `pricing.manage`)",
    responses={404: {"description": "Pricing rule not found"}})
async def update_pricing_rule(rule_id: UUID, body: PricingRuleUpdate, admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    row = await db.get(PricingRule, rule_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pricing rule not found")
    changes = body.model_dump(exclude_unset=True)
    old = {k: getattr(row, k) for k in changes}
    for k, v in changes.items():
        setattr(row, k, v)
    await write_audit_log(db, admin_id, "pricing_rule", rule_id, "update", old, changes)
    await db.flush()
    return PricingRuleResponse.model_validate(row)


@router.delete("/pricing-rules/{rule_id}", summary="Deactivate a pricing rule",
    description="**Database tables:** `pricing_rules`\n\n**Permissions:** Requires JWT token (role: admin, permission: `pricing.manage`)",
    responses={404: {"description": "Pricing rule not found"}})
async def deactivate_pricing_rule(rule_id: UUID, admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    row = await db.get(PricingRule, rule_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pricing rule not found")
    row.is_active = False
    await db.flush()
    return {"id": str(rule_id), "is_active": False}


# --- Surge Pricing Rules ---

@router.get("/surge-rules", response_model=list[SurgePricingRuleResponse], summary="List surge pricing rules",
    description="**Database tables:** `surge_pricing_rules`\n\n**Permissions:** Requires JWT token (role: admin, permission: `pricing.manage`)")
async def list_surge_rules(_admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(SurgePricingRule))).scalars().all()
    return [SurgePricingRuleResponse.model_validate(r) for r in rows]


@router.post("/surge-rules", response_model=SurgePricingRuleResponse, status_code=201, summary="Create a surge pricing rule",
    description="**Database tables:** `surge_pricing_rules`\n\n**Permissions:** Requires JWT token (role: admin, permission: `pricing.manage`)")
async def create_surge_rule(body: SurgePricingRuleCreate, admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    row = SurgePricingRule(**body.model_dump())
    db.add(row)
    await db.flush()
    await log_admin_action(db, admin_id, "catalog.surge_rule_created", "surge_pricing_rule", row.id, row.rule_name)
    return SurgePricingRuleResponse.model_validate(row)


@router.put("/surge-rules/{rule_id}", response_model=SurgePricingRuleResponse, summary="Update a surge pricing rule",
    description="**Database tables:** `surge_pricing_rules`\n\n**Permissions:** Requires JWT token (role: admin, permission: `pricing.manage`)",
    responses={404: {"description": "Surge rule not found"}})
async def update_surge_rule(rule_id: UUID, body: SurgePricingRuleUpdate, admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    row = await db.get(SurgePricingRule, rule_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Surge rule not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await db.flush()
    return SurgePricingRuleResponse.model_validate(row)


@router.delete("/surge-rules/{rule_id}", summary="Deactivate a surge pricing rule",
    description="**Database tables:** `surge_pricing_rules`\n\n**Permissions:** Requires JWT token (role: admin, permission: `pricing.manage`)",
    responses={404: {"description": "Surge rule not found"}})
async def deactivate_surge_rule(rule_id: UUID, admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    row = await db.get(SurgePricingRule, rule_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Surge rule not found")
    row.is_active = False
    await db.flush()
    return {"id": str(rule_id), "is_active": False}


# --- Packages (subscriptions) ---

@router.get(
    "/packages", response_model=list[PackageResponse], summary="List consumer membership packages",
    description=(
        "There is no dedicated \"packages\" catalog table in the live schema — "
        "`subscriptions` (PLUS_MONTHLY/PLUS_ANNUAL/B2B, a fixed enum) is the "
        "closest real analog and what this endpoint exposes. See "
        "models/subscription.py for the full design-decision note.\n\n"
        "**Database tables:** `subscriptions`\n\n"
        "**Permissions:** Requires JWT token (role: admin, permission: `pricing.manage`)"
    ),
)
async def list_packages(
    _admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db),
    status_filter: str | None = Query(default=None, alias="status"),
):
    stmt = select(Subscription).order_by(Subscription.created_at.desc())
    if status_filter:
        stmt = stmt.where(Subscription.status == status_filter)
    rows = (await db.execute(stmt)).scalars().all()
    return [PackageResponse.model_validate(r) for r in rows]


@router.put(
    "/packages/{subscription_id}/status", response_model=PackageResponse,
    summary="Change a consumer's package status (cancel/reactivate)",
    description="**Database tables:** `subscriptions`, `admin_actions`\n\n**Permissions:** Requires JWT token (role: admin, permission: `pricing.manage`)",
    responses={404: {"description": "Subscription not found"}, 422: {"description": "Invalid status value"}},
)
async def update_package_status(
    subscription_id: UUID, body: PackageStatusUpdateRequest,
    admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db),
):
    if body.status not in SUBSCRIPTION_STATUS_VALUES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"status must be one of {SUBSCRIPTION_STATUS_VALUES}")
    row = await db.get(Subscription, subscription_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subscription not found")
    row.status = body.status
    await log_admin_action(db, admin_id, "package.status_updated", "subscription", subscription_id, body.status)
    await db.flush()
    return PackageResponse.model_validate(row)
