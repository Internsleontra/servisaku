# Architecture

## Where this backend sits in the monorepo

`servisaku-partner-consumer` is a monorepo containing several independently
maintained pieces that share one database:

```
servisaku-partner-consumer/
├── backend/            <- THIS backend: FastAPI, Partner mobile app API
├── server/              <- Express/Prisma backend (other modules)
├── prisma/                <- Prisma schema for server/
├── src/, public/            <- Vite/React web frontend
├── servisaku-app/             <- (other frontend target)
├── servisaku-consumer/          <- Expo consumer mobile app
├── servisaku-mobile/              <- Expo partner mobile app
└── servisaku-website/               <- Marketing site
```

`backend/` was migrated into this repo (via `git filter-repo` + `git
subtree`, preserving commit history) from a standalone repo it was
originally built in, once it was clarified that `servisaku-partner-
consumer` — sharing the same production database — was its intended home.
It does not modify or depend on `server/`'s Express/Prisma code; both
backends read/write the same PostgreSQL database independently, each owning
different tables (this backend owns none exclusively — every table it
touches was either pre-existing shared infrastructure or built by another
team member for a module this backend later filled in, e.g. `job_dispatches`
for Smart Dispatch).

## Backend architecture (`backend/`)

```
Client (mobile app / Swagger UI / Socket.IO client)
        │
        ▼
┌─────────────────────────────────────────────┐
│  main.py                                     │
│  ├── FastAPI app (REST, /api/v1/*)           │
│  └── socketio.ASGIApp wrapping it (/socket.io)│
└─────────────────────────────────────────────┘
        │                          │
        ▼                          ▼
┌───────────────┐         ┌──────────────────────┐
│  routes/*.py   │         │ services/realtime/    │
│  (FastAPI       │        │ socket_server.py       │
│  routers, one    │       │ (Socket.IO event         │
│  file per domain) │      │  handlers, JWT auth,      │
└───────────────┘   │      │  room management)          │
        │             │     └──────────────────────┘
        ▼              │              ▲
┌───────────────┐       │              │ in-process pub/sub
│  services/*.py  │      │              │ (services/realtime/events.py)
│  business logic:  │    │              │ — decouples business logic
│  gateways, dispatch,│  │              │   from the Socket.IO layer
│  notifications, rbac │ │──────────────┘
└───────────────┘        │
        │                 │
        ▼                 ▼
┌────────────────────────────┐
│  models/*.py (SQLAlchemy ORM)│
│  database.py (async engine)   │
└────────────────────────────┘
        │
        ▼
   PostgreSQL (servisakudb, AWS RDS, PostGIS enabled)
```

**Layering convention**: routes never contain business logic beyond
request validation and orchestration — anything with real decision-making
(scoring, state machines, provider fallback chains) lives in `services/`.
Models are thin SQLAlchemy declarative classes with no business logic.
Schemas (`schemas/*.py`) are Pydantic request/response contracts, kept
separate from ORM models so the external API shape can stay stable even
when the underlying table's columns don't match 1:1 (see
`models/partner.py`'s `kyc_status_from_partner_status` translation for the
canonical example).

**Provider-agnostic integrations**: payments (`services/gateway_base.py` +
`gateway_registry.py` + `billplz_gateway.py`/`ipay88_gateway.py`) and
notifications (`services/notifications/registry.py` + per-provider push/
email/SMS modules) both follow the same pattern — an abstract interface, a
registry that picks an implementation, and business logic that only ever
calls the interface. Swapping or adding a provider never touches a route or
a business-logic call site.

**Real-time event bridge**: `services/realtime/events.py` is a minimal
in-process pub/sub bus. Business logic (e.g. `services/dispatch/engine.py`)
emits named events (`dispatch.offer_created`, `booking.status_changed`,
...) without importing Socket.IO at all; `services/realtime/socket_server.py`
subscribes and maps events to room broadcasts. This avoids a circular
import (dispatch logic needing the socket server, which needs auth, which
dispatch also needs) and keeps the Socket.IO layer swappable.

**RBAC layer**: `services/rbac.py` adds a second, granular permission check
(`require_permission("partners.approve")`) on top of the coarse `role:
admin` JWT claim every route already checked before Stage 6. It queries
`user_roles -> roles -> role_permissions -> permissions` — a schema that
existed, pre-seeded, since before this backend touched it, but had never
been wired to any code (`user_roles` had 0 rows).

## Database architecture

**Single shared PostgreSQL database** (`servisakudb`), not owned
exclusively by this backend — built up incrementally by multiple team
members across modules (Booking Engine, Admin Catalog, Consumer, B2B,
Training, Ops/Support). This backend's approach throughout every stage has
been: **query the live schema first, map to what actually exists, never
assume or redesign.** That discipline caught two live schema-shape
surprises (documented in `docs/today-work/DATABASE_CHANGES.md`) that would
otherwise have caused silent data corruption or runtime failures.

Key structural facts:

- **83 tables** as of the most recent full schema query (Stage 8), stable
  since Stage 4.
- **PostGIS** is enabled — `partners.home_location` and
  `consumer_addresses.location` are `geography(Point,4326)` columns, used
  by Smart Dispatch's proximity search via raw `ST_Distance`/`ST_DWithin`
  SQL (not mapped through the ORM — see `services/dispatch/matching.py`).
- **Enums are Postgres-native**, not application-level — every
  `SQLAlchemy Enum(..., create_type=False)` in `models/*.py` mirrors a type
  that already exists in the database; `create_type=False` ensures
  SQLAlchemy never tries to (re)create them.
- **Identity is centralized**: the shared `users` table (with
  `user_type`/`status` enums) is the FK target for `partners.user_id`,
  `consumer_profiles.user_id`, `reviews.reviewer_id/reviewee_id`,
  `notifications.user_id`, `user_roles.user_id`, etc. — every module's
  identity flows through one table.
- **`job_dispatches` is both a live queue and a permanent log** — rows are
  never deleted, only their `status` transitions
  (`PENDING -> ACCEPTED/DECLINED/EXPIRED`); `GET
  /dispatch/bookings/{id}/history` is a plain read of this same table.
- **Generated columns exist** — e.g. `audit_logs.retention_until
  GENERATED ALWAYS AS (...) STORED` — and must never be included in an ORM
  model's writable columns (see `docs/ADMIN_BACKEND.md` for the bug this
  caused and the fix).
- **No analytics views or materialized views exist** — confirmed via
  `information_schema.views`/`pg_matviews` before Stage 7 — so every
  analytics endpoint is a live aggregate query, not a cached rollup.

See `docs/today-work/DATABASE_CHANGES.md` for the full table-by-table
history of what was discovered and mapped at each stage.

## Request flow examples

**Booking → payment → dispatch → real-time offer** (the core cross-cutting
flow spanning Stages 1, 4, and 5):

```
POST /consumer/bookings          (routes/consumer.py)     -> bookings row, PENDING_PAYMENT
POST /payments/bookings/{id}/bill (routes/payments.py)     -> Billplz checkout
POST /payments/billplz/callback   (routes/payments.py)      -> _mark_payment_paid()
                                                                 ├── bookings.booking_status = CONFIRMED
                                                                 ├── events.emit("booking.status_changed")
                                                                 └── start_dispatch() (services/dispatch/engine.py)
                                                                       ├── get_ranked_candidates() (matching.py)
                                                                       ├── job_dispatches row created (PENDING)
                                                                       └── events.emit("dispatch.offer_created")
                                                                             └── socket_server.py broadcasts
                                                                                 "dispatch:job_offer" to partner:{id} room
```

**Admin mutation → audit trail** (Stage 6 pattern, applied uniformly):

```
POST /admin/partners/{id}/approve (routes/admin_partners.py)
  ├── require_permission("partners.approve")  — RBAC gate
  ├── partners.status: SUBMITTED -> ACTIVE
  ├── dispatch() notification                 — services/notifications/dispatcher.py
  ├── write_audit_log()                       — structured before/after (audit_logs)
  └── log_admin_action()                      — one-line action log (admin_actions)
```
