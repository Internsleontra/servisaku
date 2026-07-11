# ServisAku Partner API — Backend

FastAPI + SQLAlchemy (async) + PostgreSQL (PostGIS) backend for the
ServisAku home-services marketplace: partner onboarding/KYC, job
management, payments/escrow, media uploads, notifications, Smart Dispatch,
real-time communication (Socket.IO), an admin backend with RBAC, and
analytics.

This backend lives at `backend/` inside the `servisaku-partner-consumer`
monorepo (shared with the Express/Prisma web backend and the frontend apps)
and shares the team's single PostgreSQL database (`servisakudb`, AWS RDS).
See `docs/ARCHITECTURE.md` for how it fits alongside the rest of the repo.

## Quick start

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # fill in DATABASE_URL and JWT_SECRET_KEY at minimum
python seed.py          # idempotent — creates test accounts + sample data
uvicorn main:socket_app --reload --port 8000
```

Open **http://localhost:8000/docs** for interactive Swagger UI (JWT
Authorize button pre-wired). See `docs/ENVIRONMENT_SETUP.md` for the full
setup, including the SSH tunnel needed to reach the team's shared RDS
instance, and `docs/DEPLOYMENT.md` for running this in production.

Run `uvicorn main:socket_app` (not `main:app`) to get Socket.IO — `app` on
its own is the plain FastAPI instance without the Engine.IO transport
mounted.

## Test credentials (seeded by `seed.py`)

| Role | Phone | Password |
|------|-------|----------|
| Admin (SUPER_ADMIN) | +60100000001 | Admin@123 |
| Partner | +60100000002 | Partner@123 |
| Partner 2 | +60100000004 | Partner@123 |
| Consumer | +60100000003 | Customer@123 |

## Feature areas

| Area | Docs |
|---|---|
| Payments (Billplz/iPay88), escrow, refunds | `docs/BILLPLZ_SETUP.md`, `API_TESTING_REPORT.md` |
| Media uploads (Cloudinary) | `API_TESTING_REPORT.md` |
| Notifications (push/SMS/email) | `API_TESTING_REPORT.md` |
| Smart Dispatch | `docs/SMART_DISPATCH.md` |
| Real-time (Socket.IO) | `docs/SOCKET_ARCHITECTURE.md` |
| Admin Backend + RBAC | `docs/ADMIN_BACKEND.md` |
| Analytics | `docs/ANALYTICS.md` |
| Testing | `docs/TESTING_GUIDE.md` |
| Architecture | `docs/ARCHITECTURE.md` |
| Security | `docs/SECURITY.md` |
| Deployment | `docs/DEPLOYMENT.md` |

Day-by-day build history, database-drift discoveries, and full API
verification logs are under `docs/today-work/` and `API_TESTING_REPORT.md`.

## Project structure

```
backend/
├── main.py              # FastAPI app + Socket.IO ASGI mount
├── config.py             # Settings (env-driven)
├── database.py           # Async SQLAlchemy engine/session
├── auth.py                # JWT + password hashing + role dependencies
├── seed.py                 # Idempotent test data seeding
├── models/                  # SQLAlchemy ORM models (one file per domain)
├── schemas/                  # Pydantic request/response schemas
├── routes/                    # FastAPI routers (one file per domain)
├── services/                   # Business logic: gateways, dispatch, notifications, realtime, rbac
├── migrations/                  # Alembic
├── tests/                        # pytest suite (see docs/TESTING_GUIDE.md)
└── docs/                          # All documentation referenced above
```

## Status

Stages 1-9 complete (Payment Gateway, Media Uploads, Notification
Dispatcher, Smart Dispatch, Real-Time Communication, Admin Backend, RBAC,
Analytics, Testing & QA, Documentation). See `docs/today-work/TODAY_WORK.md`
for the full narrative and `docs/today-work/GIT_COMMITS.md` for the commit
history.
