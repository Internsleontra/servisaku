from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.coupon import Coupon, CouponServiceCategory, DISCOUNT_TYPE_VALUES
from models.catalog import ServiceCategory
from schemas.coupon import CouponCreate, CouponUpdate, CouponResponse
from services.rbac import require_permission, log_admin_action, write_audit_log

router = APIRouter(prefix="/admin/coupons", tags=["Admin - Coupons"])

_PERM = "coupons.manage"


@router.get(
    "", response_model=list[CouponResponse], summary="List coupons",
    description="**Database tables:** `coupons`\n\n**Permissions:** Requires JWT token (role: admin, permission: `coupons.manage`)",
)
async def list_coupons(
    _admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db),
    is_active: bool | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
):
    stmt = select(Coupon).order_by(Coupon.created_at.desc())
    if is_active is not None:
        stmt = stmt.where(Coupon.is_active == is_active)
    stmt = stmt.limit(limit).offset(offset)
    rows = (await db.execute(stmt)).scalars().all()
    return [CouponResponse.model_validate(r) for r in rows]


@router.get(
    "/{coupon_id}", response_model=CouponResponse, summary="Get a coupon",
    description="**Database tables:** `coupons`\n\n**Permissions:** Requires JWT token (role: admin, permission: `coupons.manage`)",
    responses={404: {"description": "Coupon not found"}},
)
async def get_coupon(coupon_id: UUID, _admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    row = await db.get(Coupon, coupon_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coupon not found")
    return CouponResponse.model_validate(row)


@router.post(
    "", response_model=CouponResponse, status_code=201, summary="Create a coupon",
    description=(
        "`discount_type` is an app-level convention "
        f"({DISCOUNT_TYPE_VALUES}) — the live `coupons.discount_type` column is a "
        "plain varchar, not a DB enum.\n\n"
        "**Database tables:** `coupons`, `coupon_service_categories`\n\n"
        "**Permissions:** Requires JWT token (role: admin, permission: `coupons.manage`)"
    ),
    responses={422: {"description": "Invalid discount_type or unknown service_category_id"}},
)
async def create_coupon(body: CouponCreate, admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    if body.discount_type not in DISCOUNT_TYPE_VALUES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"discount_type must be one of {DISCOUNT_TYPE_VALUES}")

    data = body.model_dump(exclude={"service_category_ids"})
    row = Coupon(**data, created_by=admin_id)
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "A coupon with this code already exists")

    for cat_id in body.service_category_ids:
        if not await db.get(ServiceCategory, cat_id):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown service_category_id: {cat_id}")
        db.add(CouponServiceCategory(coupon_id=row.id, service_category_id=cat_id))

    await log_admin_action(db, admin_id, "coupon.created", "coupon", row.id, row.code)
    await db.flush()
    return CouponResponse.model_validate(row)


@router.put(
    "/{coupon_id}", response_model=CouponResponse, summary="Update a coupon",
    description="**Database tables:** `coupons`, `audit_logs`\n\n**Permissions:** Requires JWT token (role: admin, permission: `coupons.manage`)",
    responses={404: {"description": "Coupon not found"}},
)
async def update_coupon(coupon_id: UUID, body: CouponUpdate, admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    row = await db.get(Coupon, coupon_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coupon not found")
    changes = body.model_dump(exclude_unset=True)
    old = {k: getattr(row, k) for k in changes}
    for k, v in changes.items():
        setattr(row, k, v)
    await write_audit_log(db, admin_id, "coupon", coupon_id, "update", old, changes)
    await db.flush()
    return CouponResponse.model_validate(row)


@router.delete(
    "/{coupon_id}", summary="Deactivate a coupon",
    description="Sets `is_active=false` — never hard-deletes (usage history must survive).\n\n**Database tables:** `coupons`\n\n**Permissions:** Requires JWT token (role: admin, permission: `coupons.manage`)",
    responses={404: {"description": "Coupon not found"}},
)
async def deactivate_coupon(coupon_id: UUID, admin_id: UUID = Depends(require_permission(_PERM)), db: AsyncSession = Depends(get_db)):
    row = await db.get(Coupon, coupon_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coupon not found")
    row.is_active = False
    await log_admin_action(db, admin_id, "coupon.deactivated", "coupon", coupon_id, None)
    await db.flush()
    return {"id": str(coupon_id), "is_active": False}
