"""
Idempotent seed script — creates default test accounts and sample data.
Run: python seed.py
"""
import asyncio
import uuid
from datetime import datetime, timedelta, date, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import async_session, engine, Base
from auth import hash_password
from models.auth import AuthUser
from models.partner import (
    Partner, BankAccount, PartnerCategory,
    PartnerServiceArea, PartnerAvailability,
)
from models.customer import Customer
from models.job import Job, JobStatusLog
from models.earning import Earning
from models.review import Review
from models.notification import Notification
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


async def seed_account(db: AsyncSession, acct: dict) -> tuple[AuthUser, Partner | None]:
    existing = (await db.execute(
        select(AuthUser).where(AuthUser.email == acct["email"])
    )).scalar_one_or_none()

    if existing:
        print(f"  [skip] {acct['email']} already exists")
        partner = (await db.execute(
            select(Partner).where(Partner.auth_user_id == existing.id)
        )).scalar_one_or_none()
        return existing, partner

    auth_user = AuthUser(
        email=acct["email"],
        phone=acct["phone"],
        password_hash=hash_password(acct["password"]),
        role=acct["role"],
    )
    db.add(auth_user)
    await db.flush()

    partner = Partner(
        auth_user_id=auth_user.id,
        full_name=acct["full_name"],
        phone=acct["phone"],
        email=acct["email"],
        kyc_status=acct["kyc_status"],
        is_online=acct["kyc_status"] == "verified",
        rating=Decimal("4.80") if acct["kyc_status"] == "verified" else Decimal("0"),
        total_jobs=15 if acct["role"] == "partner" else 0,
        completion_rate=Decimal("96.00") if acct["role"] == "partner" else Decimal("0"),
        acceptance_rate=Decimal("88.00") if acct["role"] == "partner" else Decimal("0"),
        experience_years=5 if acct["role"] == "partner" else 0,
        bio="Professional home service partner in Klang Valley" if acct["role"] == "partner" else None,
        nric="901201-14-5678" if acct["role"] == "partner" else None,
    )
    db.add(partner)
    await db.flush()

    print(f"  [created] {acct['email']} (role={acct['role']})")
    return auth_user, partner


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
    for day in ["mon", "tue", "wed", "thu", "fri"]:
        db.add(PartnerAvailability(
            partner_id=partner.id,
            day_of_week=day,
            enabled=True,
            start_time=dt_time(9, 0),
            end_time=dt_time(18, 0),
        ))
    db.add(PartnerAvailability(
        partner_id=partner.id, day_of_week="sat", enabled=True,
        start_time=dt_time(9, 0), end_time=dt_time(13, 0),
    ))
    db.add(PartnerAvailability(
        partner_id=partner.id, day_of_week="sun", enabled=False,
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
    existing = (await db.execute(
        select(Review).where(Review.partner_id == partner.id).limit(1)
    )).scalar_one_or_none()
    if existing:
        print("  [skip] Sample reviews already exist")
        return

    completed_jobs = (await db.execute(
        select(Job).where(Job.partner_id == partner.id, Job.status == "completed")
    )).scalars().all()

    reviews_data = [
        (5, "Excellent work! Very thorough cleaning.", ["punctual", "professional", "thorough"]),
        (4, "Good service, arrived on time.", ["punctual", "friendly"]),
    ]

    for job, (rating, comment, tags) in zip(completed_jobs, reviews_data):
        db.add(Review(
            job_id=job.id,
            partner_id=partner.id,
            customer_id=customer.id,
            rating=rating,
            comment=comment,
            tags=tags,
        ))

    await db.flush()
    print(f"  [created] {min(len(completed_jobs), len(reviews_data))} sample reviews")


async def seed_sample_notifications(db: AsyncSession, partner: Partner):
    existing = (await db.execute(
        select(Notification).where(Notification.partner_id == partner.id).limit(1)
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
            partner_id=partner.id,
            type=ntype,
            title=title,
            body=body,
        ))

    await db.flush()
    print(f"  [created] {len(notifs)} sample notifications")


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
            for acct in SEED_ACCOUNTS:
                auth_user, partner = await seed_account(db, acct)
                if acct["role"] == "partner":
                    partner_user = auth_user
                    partner_record = partner

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

            await db.commit()
            print("\n" + "=" * 60)
            print("Seed complete!")
            print("=" * 60)
            print("\nTest Credentials:")
            print("-" * 40)
            print("Admin:    admin@servisaku.com    / Admin@123")
            print("Partner:  partner@servisaku.com  / Partner@123")
            print("          Phone: +60100000002")
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
