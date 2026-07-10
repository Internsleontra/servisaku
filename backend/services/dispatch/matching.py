"""Smart Dispatch matching/scoring engine — finds and ranks partner
candidates for a booking.

Combines a raw-SQL PostGIS proximity search (partners.home_location and
consumer_addresses.location are geography columns intentionally left
unmapped in the ORM — see models/partner.py) with ORM-based relational
filtering (availability, skill match, blocked matches, workload) and
Python-side scoring.
"""

import uuid
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from models.partner import Partner, PartnerAvailability, PartnerLanguage
from models.dispatch import JobDispatch, BlockedMatch, PartnerServiceCategory
from models.booking import Booking
from models.consumer_profile import ConsumerProfile
from models.catalog import Service

settings = get_settings()

_WEIGHT_PROXIMITY = Decimal("0.35")
_WEIGHT_RATING = Decimal("0.25")
_WEIGHT_COMPLETION = Decimal("0.20")
_WEIGHT_LANGUAGE = Decimal("0.15")
_WEIGHT_WORKLOAD = Decimal("0.05")


@dataclass
class Candidate:
    partner_id: uuid.UUID
    distance_km: Decimal
    proximity_score: Decimal
    rating_score: Decimal
    completion_score: Decimal
    language_score: Decimal
    workload_score: Decimal
    match_score: Decimal


async def _nearby_active_partners(db: AsyncSession, address_id: uuid.UUID) -> list[tuple[uuid.UUID, Decimal]]:
    """ACTIVE + available partners within their own service_radius_km of the
    booking's address, ordered by distance. Index-accelerated via the
    existing idx_partners_geo/idx_consumer_addr_geo GiST indexes."""
    stmt = text("""
        SELECT p.id, ST_Distance(p.home_location, a.location) / 1000.0 AS distance_km
        FROM partners p, consumer_addresses a
        WHERE a.id = :address_id
          AND p.status = 'ACTIVE' AND p.is_available = true
          AND p.home_location IS NOT NULL AND a.location IS NOT NULL
          AND ST_DWithin(p.home_location, a.location, LEAST(p.service_radius_km, :radius_cap) * 1000.0)
        ORDER BY distance_km ASC
    """)
    rows = (await db.execute(stmt, {
        "address_id": str(address_id),
        "radius_cap": settings.DISPATCH_SEARCH_RADIUS_KM_CAP,
    })).fetchall()
    return [(row[0], Decimal(str(row[1]))) for row in rows]


async def _partner_available_for_slot(db: AsyncSession, partner_id: uuid.UUID, booking: Booking) -> bool:
    day_of_week = booking.scheduled_date.weekday()  # 0=Mon..6=Sun, matches live convention
    stmt = select(PartnerAvailability).where(
        PartnerAvailability.partner_id == partner_id,
        PartnerAvailability.day_of_week == day_of_week,
        PartnerAvailability.is_active == True,  # noqa: E712
        PartnerAvailability.start_time <= booking.slot_start_time,
        PartnerAvailability.end_time >= booking.slot_end_time,
    )
    return (await db.execute(stmt)).scalars().first() is not None


async def _partner_has_skill(db: AsyncSession, partner_id: uuid.UUID, service_category_id: uuid.UUID) -> bool:
    stmt = select(PartnerServiceCategory).where(
        PartnerServiceCategory.partner_id == partner_id,
        PartnerServiceCategory.service_category_id == service_category_id,
        PartnerServiceCategory.is_active == True,  # noqa: E712
    )
    return (await db.execute(stmt)).scalars().first() is not None


async def _workload_today(db: AsyncSession, partner_id: uuid.UUID, scheduled_date) -> int:
    stmt = select(Booking.id).where(
        Booking.partner_id == partner_id,
        Booking.scheduled_date == scheduled_date,
        Booking.booking_status.notin_(["COMPLETED", "CANCELLED_BY_CONSUMER", "CANCELLED_BY_PARTNER", "REFUNDED"]),
    )
    return len((await db.execute(stmt)).scalars().all())


async def _max_jobs_per_day(db: AsyncSession, partner_id: uuid.UUID, day_of_week: int) -> int:
    stmt = select(PartnerAvailability.max_jobs_per_day).where(
        PartnerAvailability.partner_id == partner_id, PartnerAvailability.day_of_week == day_of_week,
    )
    val = (await db.execute(stmt)).scalar_one_or_none()
    return val or 4


async def _speaks_language(db: AsyncSession, partner_id: uuid.UUID, language_code: str) -> bool:
    stmt = select(PartnerLanguage).where(
        PartnerLanguage.partner_id == partner_id, PartnerLanguage.language_code == language_code,
    )
    return (await db.execute(stmt)).scalars().first() is not None


async def get_ranked_candidates(
    db: AsyncSession, booking: Booking, exclude_partner_ids: set[uuid.UUID] | None = None,
) -> list[Candidate]:
    """Full candidate pipeline, in order: nearby search -> radius filter
    (baked into the SQL) -> availability check -> skill matching -> blocked-
    match exclusion -> already-tried exclusion -> workload cap -> scoring ->
    sort desc by match_score. Returns at most DISPATCH_MAX_CANDIDATES."""
    exclude_partner_ids = exclude_partner_ids or set()

    nearby = await _nearby_active_partners(db, booking.address_id)
    if not nearby:
        return []

    service = await db.get(Service, booking.service_id)
    category_id = service.category_id

    consumer = await db.get(ConsumerProfile, booking.consumer_id)
    preferred_language = consumer.preferred_partner_language if consumer else None

    already_tried_stmt = select(JobDispatch.partner_id).where(JobDispatch.booking_id == booking.id)
    already_tried = set((await db.execute(already_tried_stmt)).scalars().all())

    blocked_stmt = select(BlockedMatch.partner_id).where(BlockedMatch.consumer_id == booking.consumer_id)
    blocked = set((await db.execute(blocked_stmt)).scalars().all())

    day_of_week = booking.scheduled_date.weekday()
    candidates: list[Candidate] = []

    for partner_id, distance_km in nearby:
        if partner_id in exclude_partner_ids or partner_id in already_tried or partner_id in blocked:
            continue
        if not await _partner_available_for_slot(db, partner_id, booking):
            continue
        if not await _partner_has_skill(db, partner_id, category_id):
            continue

        max_jobs = await _max_jobs_per_day(db, partner_id, day_of_week)
        active_jobs = await _workload_today(db, partner_id, booking.scheduled_date)
        if active_jobs >= max_jobs:
            continue

        partner = await db.get(Partner, partner_id)

        proximity_score = max(
            Decimal("0"),
            Decimal("100") * (Decimal("1") - distance_km / Decimal(partner.service_radius_km or 1)),
        )
        rating_score = (
            Decimal("50.00") if not partner.rating_count
            else (Decimal(str(partner.average_rating)) / Decimal("5")) * Decimal("100")
        )
        completion_score = (
            Decimal("70.00") if not partner.total_completed_jobs
            else Decimal(str(partner.completion_rate))
        )

        if not preferred_language:
            language_score = Decimal("100.00")
        elif await _speaks_language(db, partner_id, preferred_language):
            language_score = Decimal("100.00")
        else:
            language_score = Decimal("30.00")

        workload_score = Decimal("100") * max(Decimal("0"), Decimal("1") - Decimal(active_jobs) / Decimal(max_jobs))

        match_score = (
            _WEIGHT_PROXIMITY * proximity_score
            + _WEIGHT_RATING * rating_score
            + _WEIGHT_COMPLETION * completion_score
            + _WEIGHT_LANGUAGE * language_score
            + _WEIGHT_WORKLOAD * workload_score
        ).quantize(Decimal("0.01"))

        candidates.append(Candidate(
            partner_id=partner_id,
            distance_km=distance_km.quantize(Decimal("0.01")),
            proximity_score=proximity_score.quantize(Decimal("0.01")),
            rating_score=rating_score.quantize(Decimal("0.01")),
            completion_score=completion_score.quantize(Decimal("0.01")),
            language_score=language_score.quantize(Decimal("0.01")),
            workload_score=workload_score.quantize(Decimal("0.01")),
            match_score=match_score,
        ))

    candidates.sort(key=lambda c: c.match_score, reverse=True)
    return candidates[: settings.DISPATCH_MAX_CANDIDATES]
