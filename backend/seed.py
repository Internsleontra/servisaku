"""
Idempotent seed script — creates default test accounts and sample data.
Run: python seed.py
"""
import asyncio
import uuid
from datetime import datetime, timedelta, date, timezone
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from database import async_session, engine, Base
from auth import hash_password
from models.auth import User
from models.partner import (
    Partner, BankAccount, PartnerCategory,
    PartnerServiceArea, PartnerAvailability, PartnerLanguage,
)
from models.dispatch import PartnerServiceCategory
from models.customer import Customer
from models.job import Job, JobStatusLog
from models.earning import Earning
from models.review import Review
from models.notification import Notification
from models.consumer_profile import ConsumerProfile
from models.consumer_address import ConsumerAddress
from models.catalog import ServiceCategory, Service
from models.booking import Booking
import models  # noqa: F401 — ensure all models registered


SEED_ACCOUNTS = [
    {
        "email": "admin@servisaku.com",
        "phone": "+60100000001",
        "password": "Admin@123",
        "role": "admin",
        "full_name": "ServisAku Admin",
        "kyc_status": "verified",
    },
    {
        "email": "partner@servisaku.com",
        "phone": "+60100000002",
        "password": "Partner@123",
        "role": "partner",
        "full_name": "Ahmad Rizal",
        "kyc_status": "verified",
    },
    {
        "email": "customer@servisaku.com",
        "phone": "+60100000003",
        "password": "Customer@123",
        "role": "customer",
        "full_name": "Siti Nurhaliza",
        "kyc_status": "not_started",
    },
]


_ROLE_TO_USER_TYPE = {"admin": "ADMIN", "partner": "PARTNER", "customer": "CONSUMER"}


async def seed_account(db: AsyncSession, acct: dict) -> tuple[User, Partner | None]:
    existing = (await db.execute(
        select(User).where(User.email == acct["email"])
    )).scalar_one_or_none()

    if existing:
        print(f"  [skip] {acct['email']} already exists")
        partner = (await db.execute(
            select(Partner).where(Partner.user_id == existing.id)
        )).scalar_one_or_none()
        return existing, partner

    user = User(
        user_type=_ROLE_TO_USER_TYPE[acct["role"]],
        email=acct["email"],
        phone_number=acct["phone"],
        password_hash=hash_password(acct["password"]),
        status="ACTIVE",
        is_phone_verified=True,
        is_email_verified=True,
    )
    db.add(user)
    await db.flush()

    # Only "partner"-role seed accounts get a Partner row — partners.nric_or_passport_number
    # is NOT NULL + UNIQUE, so admin/customer accounts (which have no NRIC) don't get one.
    partner = None
    if acct["role"] == "partner":
        partner = Partner(
            user_id=user.id,
            full_name=acct["full_name"],
            nric_or_passport_number="901201-14-5678",
            status="ACTIVE" if acct["kyc_status"] == "verified" else "DRAFT",
            is_available=acct["kyc_status"] == "verified",
            average_rating=Decimal("4.80") if acct["kyc_status"] == "verified" else Decimal("0"),
            total_completed_jobs=15,
            completion_rate=Decimal("96.00"),
        )
        db.add(partner)
        await db.flush()

    print(f"  [created] {acct['email']} (role={acct['role']})")
    return user, partner


async def seed_partner_details(db: AsyncSession, partner: Partner):
    existing_bank = (await db.execute(
        select(BankAccount).where(BankAccount.partner_id == partner.id)
    )).scalar_one_or_none()
    if existing_bank:
        return

    db.add(BankAccount(
        partner_id=partner.id,
        bank_name="Maybank",
        account_name="Ahmad Rizal bin Abdullah",
        account_number="1234567890",
    ))

    for cat_id in ["cleaning", "ac", "plumbing"]:
        db.add(PartnerCategory(partner_id=partner.id, category_id=cat_id))

    for name, zone in [("Petaling Jaya", "central"), ("Shah Alam", "west"), ("Subang Jaya", "central")]:
        db.add(PartnerServiceArea(partner_id=partner.id, name=name, zone=zone))

    from datetime import time as dt_time
    # day_of_week is an integer live (0=Mon..6=Sun), not the "mon"/"tue" strings
    # the old model used.
    for day in range(5):  # Mon-Fri = 0-4
        db.add(PartnerAvailability(
            partner_id=partner.id,
            day_of_week=day,
            is_active=True,
            start_time=dt_time(9, 0),
            end_time=dt_time(18, 0),
        ))
    db.add(PartnerAvailability(
        partner_id=partner.id, day_of_week=5, is_active=True,  # Sat
        start_time=dt_time(9, 0), end_time=dt_time(13, 0),
    ))
    db.add(PartnerAvailability(
        partner_id=partner.id, day_of_week=6, is_active=False,  # Sun
        start_time=dt_time(9, 0), end_time=dt_time(18, 0),
    ))

    await db.flush()
    print("  [created] Partner details (bank, categories, areas, availability)")


async def seed_sample_customer(db: AsyncSession) -> Customer:
    existing = (await db.execute(
        select(Customer).where(Customer.phone == "+60112223344")
    )).scalar_one_or_none()
    if existing:
        return existing

    cust = Customer(
        full_name="Lee Wei Ming",
        phone="+60112223344",
        rating=Decimal("4.50"),
    )
    db.add(cust)
    await db.flush()
    print("  [created] Sample customer: Lee Wei Ming")
    return cust


async def seed_sample_jobs(db: AsyncSession, partner: Partner, customer: Customer):
    existing = (await db.execute(
        select(Job).where(Job.partner_id == partner.id).limit(1)
    )).scalar_one_or_none()
    if existing:
        print("  [skip] Sample jobs already exist")
        return

    now = datetime.now(timezone.utc)
    today = date.today()

    jobs_data = [
        {
            "status": "requested",
            "category_id": "cleaning",
            "service_name": "Home Cleaning",
            "package_name": "Standard Clean",
            "address_label": "Sunway Geo Residences",
            "address_full": "Jalan Lagoon Selatan, Bandar Sunway, 47500 Subang Jaya",
            "property_type": "condo",
            "gross_amount": Decimal("150.00"),
            "scheduled_date": today + timedelta(days=1),
            "time_slot": "10:00 AM - 12:00 PM",
            "duration_min": 120,
            "distance_km": Decimal("5.20"),
        },
        {
            "status": "requested",
            "category_id": "ac",
            "service_name": "AC Service",
            "package_name": "Full Service + Chemical Wash",
            "address_label": "The Tropika",
            "address_full": "Persiaran Tropika, 47410 Petaling Jaya",
            "property_type": "condo",
            "gross_amount": Decimal("280.00"),
            "scheduled_date": today + timedelta(days=2),
            "time_slot": "2:00 PM - 4:00 PM",
            "duration_min": 90,
            "distance_km": Decimal("3.80"),
        },
        {
            "status": "accepted",
            "category_id": "cleaning",
            "service_name": "Deep Cleaning",
            "package_name": "Move-In Deep Clean",
            "address_label": "Damansara Uptown",
            "address_full": "Jalan SS 21/39, Damansara Utama, 47400 Petaling Jaya",
            "property_type": "landed",
            "gross_amount": Decimal("350.00"),
            "scheduled_date": today,
            "time_slot": "9:00 AM - 1:00 PM",
            "duration_min": 240,
            "distance_km": Decimal("2.10"),
        },
        {
            "status": "completed",
            "category_id": "plumbing",
            "service_name": "Plumbing Repair",
            "package_name": "Pipe Leak Fix",
            "address_label": "Kelana Jaya",
            "address_full": "Jalan SS 7/26, Kelana Jaya, 47301 Petaling Jaya",
            "property_type": "landed",
            "gross_amount": Decimal("200.00"),
            "scheduled_date": today - timedelta(days=2),
            "time_slot": "10:00 AM - 11:00 AM",
            "duration_min": 60,
            "distance_km": Decimal("4.50"),
            "completed_at": now - timedelta(days=2),
        },
        {
            "status": "completed",
            "category_id": "cleaning",
            "service_name": "Home Cleaning",
            "package_name": "Standard Clean",
            "address_label": "Ara Damansara",
            "address_full": "Jalan PJU 1A/3, Ara Damansara, 47301 Petaling Jaya",
            "property_type": "condo",
            "gross_amount": Decimal("120.00"),
            "scheduled_date": today - timedelta(days=5),
            "time_slot": "2:00 PM - 4:00 PM",
            "duration_min": 120,
            "distance_km": Decimal("6.00"),
            "completed_at": now - timedelta(days=5),
        },
    ]

    for jd in jobs_data:
        fee = jd["gross_amount"] * Decimal("0.20")
        payout = jd["gross_amount"] * Decimal("0.80")
        job = Job(
            partner_id=partner.id,
            customer_id=customer.id,
            status=jd["status"],
            category_id=jd["category_id"],
            service_name=jd["service_name"],
            package_name=jd["package_name"],
            addons=[],
            address_label=jd["address_label"],
            address_full=jd["address_full"],
            property_type=jd["property_type"],
            distance_km=jd["distance_km"],
            scheduled_date=jd["scheduled_date"],
            time_slot=jd["time_slot"],
            duration_min=jd["duration_min"],
            gross_amount=jd["gross_amount"],
            platform_fee=fee,
            payout=payout,
            completed_at=jd.get("completed_at"),
        )
        db.add(job)
        await db.flush()

        if jd["status"] == "completed":
            db.add(Earning(
                partner_id=partner.id,
                job_id=job.id,
                gross_amount=jd["gross_amount"],
                commission=fee,
                payout=payout,
                escrow_status="released",
                released_at=jd["completed_at"] + timedelta(hours=24),
            ))

    await db.flush()
    print(f"  [created] {len(jobs_data)} sample jobs with earnings")


async def seed_sample_reviews(db: AsyncSession, partner: Partner, customer: Customer):
    # Intentionally skipped: reviews.booking_id is a NOT NULL FK to the shared
    # `bookings` table (owned by the Booking Engine module), and jobs aren't
    # linked to real bookings yet (jobs.booking_id is nullable and unset for
    # this seed data). Fabricating placeholder bookings/consumer_profiles/services
    # rows just to satisfy that FK risks colliding with real work-in-progress on
    # a shared database. Revisit once jobs<->bookings unification lands.
    print("  [skip] Sample reviews not seeded — requires a real bookings row (see comment in seed.py)")


async def seed_sample_notifications(db: AsyncSession, partner: Partner):
    existing = (await db.execute(
        select(Notification).where(Notification.user_id == partner.user_id).limit(1)
    )).scalar_one_or_none()
    if existing:
        print("  [skip] Sample notifications already exist")
        return

    notifs = [
        ("job", "New Job Request", "You have a new home cleaning request in Sunway."),
        ("payout", "Payout Processed", "RM 256.00 has been transferred to your Maybank account."),
        ("rating", "New Review", "Lee Wei Ming rated you 5 stars. Great job!"),
        ("system", "Welcome to ServisAku", "Your account has been verified. Start accepting jobs now!"),
    ]
    for ntype, title, body in notifs:
        db.add(Notification(
            user_id=partner.user_id,
            notification_type=ntype,
            title=title,
            message=body,
            channel="IN_APP",
        ))

    await db.flush()
    print(f"  [created] {len(notifs)} sample notifications")


async def seed_consumer_profile(db: AsyncSession, consumer_user: User) -> tuple[ConsumerProfile, ConsumerAddress]:
    profile = (await db.execute(
        select(ConsumerProfile).where(ConsumerProfile.user_id == consumer_user.id)
    )).scalar_one_or_none()
    if not profile:
        profile = ConsumerProfile(user_id=consumer_user.id, full_name="Siti Nurhaliza")
        db.add(profile)
        await db.flush()
        print("  [created] Consumer profile for customer@servisaku.com")
    else:
        print("  [skip] Consumer profile already exists")

    address = (await db.execute(
        select(ConsumerAddress).where(ConsumerAddress.consumer_id == profile.id)
    )).scalar_one_or_none()
    if not address:
        address = ConsumerAddress(
            consumer_id=profile.id,
            label="Home",
            street_address="12-3, Jalan SS 2/24, Petaling Jaya",
            area="SS2", city="Petaling Jaya", state="Selangor", postcode="47300",
            country="Malaysia", is_default=True,
        )
        db.add(address)
        await db.flush()
        print("  [created] Consumer address")
    else:
        print("  [skip] Consumer address already exists")

    return profile, address


async def seed_sample_service(db: AsyncSession) -> Service | None:
    existing = (await db.execute(select(Service).limit(1))).scalar_one_or_none()
    if existing:
        print("  [skip] Sample service already exists")
        return existing

    category = (await db.execute(
        select(ServiceCategory).where(ServiceCategory.slug == "home-cleaning")
    )).scalar_one_or_none()
    if not category:
        print("  [skip] No 'home-cleaning' service_categories row found — cannot seed a sample service")
        return None

    service = Service(
        category_id=category.id,
        name="Standard Home Cleaning",
        slug="standard-home-cleaning",
        description="A standard 2-hour home cleaning session.",
        estimated_duration_minutes=120,
        starting_price_rm=Decimal("150.00"),
    )
    db.add(service)
    await db.flush()
    print("  [created] Sample service: Standard Home Cleaning (under 'Home Cleaning' category)")
    return service


async def seed_dispatch_geo_and_skills(db: AsyncSession, partner: Partner, address: ConsumerAddress, category: ServiceCategory | None):
    """Smart Dispatch (Stage 4) needs real coordinates and a skill match to
    find any candidates at all — partners.home_location/consumer_addresses.location
    are PostGIS geography columns that nothing writes to yet, and
    partner_service_categories started this session with 0 rows. All
    additive, idempotent (checked before writing)."""
    row = (await db.execute(text("SELECT home_location IS NOT NULL FROM partners WHERE id = :id"), {"id": str(partner.id)})).scalar_one()
    if not row:
        # Ahmad Rizal — placed ~1.7km from the seeded SS2, Petaling Jaya address
        await db.execute(text(
            "UPDATE partners SET home_location = ST_SetSRID(ST_MakePoint(101.6100, 3.1200), 4326)::geography WHERE id = :id"
        ), {"id": str(partner.id)})
        print("  [created] home_location for Ahmad Rizal (~1.7km from seeded consumer address)")
    else:
        print("  [skip] Partner home_location already set")

    addr_has_location = (await db.execute(text("SELECT location IS NOT NULL FROM consumer_addresses WHERE id = :id"), {"id": str(address.id)})).scalar_one()
    if not addr_has_location:
        await db.execute(text(
            "UPDATE consumer_addresses SET location = ST_SetSRID(ST_MakePoint(101.6038, 3.1073), 4326)::geography WHERE id = :id"
        ), {"id": str(address.id)})
        print("  [created] location for the seeded consumer address (SS2, Petaling Jaya)")
    else:
        print("  [skip] Consumer address location already set")

    if category:
        existing_skill = (await db.execute(
            select(PartnerServiceCategory).where(PartnerServiceCategory.partner_id == partner.id, PartnerServiceCategory.service_category_id == category.id)
        )).scalar_one_or_none()
        if not existing_skill:
            db.add(PartnerServiceCategory(partner_id=partner.id, service_category_id=category.id, years_of_experience=5, is_active=True))
            print(f"  [created] Partner skill match: Ahmad Rizal -> {category.name}")
        else:
            print("  [skip] Partner service category already exists")

    existing_lang = (await db.execute(select(PartnerLanguage).where(PartnerLanguage.partner_id == partner.id))).scalars().first()
    if not existing_lang:
        db.add(PartnerLanguage(partner_id=partner.id, language_code="bm"))
        db.add(PartnerLanguage(partner_id=partner.id, language_code="en"))
        print("  [created] Partner languages: bm, en")
    else:
        print("  [skip] Partner languages already exist")

    await db.flush()


async def seed_second_test_partner(db: AsyncSession, category: ServiceCategory | None) -> Partner | None:
    """A second ACTIVE, geo-tagged, skill-matched partner — needed to exercise
    dispatch ranking/retry with more than one real candidate. Farther from the
    seeded consumer address than Ahmad Rizal (~9km vs ~1.7km), so ranking by
    proximity is meaningfully testable."""
    existing = (await db.execute(select(User).where(User.email == "partner2@servisaku.com"))).scalar_one_or_none()
    if existing:
        print("  [skip] partner2@servisaku.com already exists")
        partner = (await db.execute(select(Partner).where(Partner.user_id == existing.id))).scalar_one_or_none()
        return partner

    user = User(
        user_type="PARTNER", email="partner2@servisaku.com", phone_number="+60100000004",
        password_hash=hash_password("Partner@123"), status="ACTIVE",
        is_phone_verified=True, is_email_verified=True,
    )
    db.add(user)
    await db.flush()

    partner = Partner(
        user_id=user.id, full_name="Farah Aziz", nric_or_passport_number="880615-10-4321",
        status="ACTIVE", is_available=True,
        average_rating=Decimal("4.50"), rating_count=8,
        total_completed_jobs=8, completion_rate=Decimal("90.00"),
    )
    db.add(partner)
    await db.flush()

    await db.execute(text(
        "UPDATE partners SET home_location = ST_SetSRID(ST_MakePoint(101.5500, 3.0500), 4326)::geography WHERE id = :id"
    ), {"id": str(partner.id)})

    from datetime import time as dt_time
    for day in range(7):
        db.add(PartnerAvailability(
            partner_id=partner.id, day_of_week=day, is_active=(day < 6),
            start_time=dt_time(8, 0), end_time=dt_time(20, 0), max_jobs_per_day=6,
        ))

    if category:
        db.add(PartnerServiceCategory(partner_id=partner.id, service_category_id=category.id, years_of_experience=3, is_active=True))
    db.add(PartnerLanguage(partner_id=partner.id, language_code="en"))

    await db.flush()
    print("  [created] Second test partner: Farah Aziz (partner2@servisaku.com / Partner@123, phone +60100000004, ~9km away)")
    return partner


async def seed_sample_booking(
    db: AsyncSession, partner: Partner, consumer: ConsumerProfile,
    address: ConsumerAddress, service: Service | None,
):
    if service is None:
        print("  [skip] Sample booking not seeded — no service available")
        return

    existing = (await db.execute(
        select(Booking).where(Booking.consumer_id == consumer.id).limit(1)
    )).scalar_one_or_none()
    if existing:
        print("  [skip] Sample booking already exists")
        return

    from datetime import time as dt_time
    booking = Booking(
        booking_reference=f"BK-{uuid.uuid4().hex[:10].upper()}",
        consumer_id=consumer.id,
        address_id=address.id,
        service_id=service.id,
        partner_id=partner.id,
        booking_status="PENDING_PAYMENT",
        time_slot="MORNING",
        scheduled_date=date.today() + timedelta(days=1),
        slot_start_time=dt_time(9, 0),
        slot_end_time=dt_time(11, 0),
        estimated_duration_minutes=service.estimated_duration_minutes,
        subtotal_rm=service.starting_price_rm,
        surge_multiplier=Decimal("1.00"),
        discount_rm=Decimal("0.00"),
        tax_rm=Decimal("0.00"),
        total_amount_rm=service.starting_price_rm,
    )
    db.add(booking)
    await db.flush()
    print(f"  [created] Sample booking {booking.booking_reference} (PENDING_PAYMENT) — "
          f"ready for POST /payments/bookings/{{id}}/bill once Billplz credentials are set")


async def main():
    print("=" * 60)
    print("ServisAku Seed Script")
    print("=" * 60)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        try:
            print("\n1. Creating accounts...")
            partner_user = None
            partner_record = None
            consumer_user = None
            for acct in SEED_ACCOUNTS:
                user, partner = await seed_account(db, acct)
                if acct["role"] == "partner":
                    partner_user = user
                    partner_record = partner
                elif acct["role"] == "customer":
                    consumer_user = user

            if partner_record:
                print("\n2. Seeding partner details...")
                await seed_partner_details(db, partner_record)

                print("\n3. Creating sample customer...")
                customer = await seed_sample_customer(db)

                print("\n4. Creating sample jobs...")
                await seed_sample_jobs(db, partner_record, customer)

                print("\n5. Creating sample reviews...")
                await seed_sample_reviews(db, partner_record, customer)

                print("\n6. Creating sample notifications...")
                await seed_sample_notifications(db, partner_record)

                if consumer_user:
                    print("\n7. Seeding consumer profile & address...")
                    consumer_profile, consumer_address = await seed_consumer_profile(db, consumer_user)

                    print("\n8. Seeding sample service...")
                    service = await seed_sample_service(db)

                    print("\n9. Seeding sample booking...")
                    await seed_sample_booking(db, partner_record, consumer_profile, consumer_address, service)

                    category = await db.get(ServiceCategory, service.category_id) if service else None

                    print("\n10. Seeding Smart Dispatch test data (geo, skills, languages)...")
                    await seed_dispatch_geo_and_skills(db, partner_record, consumer_address, category)

                    print("\n11. Seeding second test partner for dispatch ranking/retry...")
                    await seed_second_test_partner(db, category)

            await db.commit()
            print("\n" + "=" * 60)
            print("Seed complete!")
            print("=" * 60)
            print("\nTest Credentials:")
            print("-" * 40)
            print("Admin:    admin@servisaku.com    / Admin@123")
            print("Partner:  partner@servisaku.com  / Partner@123")
            print("          Phone: +60100000002")
            print("Partner2: partner2@servisaku.com / Partner@123")
            print("          Phone: +60100000004")
            print("Customer: customer@servisaku.com / Customer@123")
            print("-" * 40)
            print("\nLogin via POST /api/v1/auth/login with:")
            print('  {"phone": "+60100000002", "password": "Partner@123"}')
            print()

        except Exception as e:
            await db.rollback()
            print(f"\nERROR: {e}")
            raise


if __name__ == "__main__":
    asyncio.run(main())
