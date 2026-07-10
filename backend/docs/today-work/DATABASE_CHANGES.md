# Database Changes — 10–11 July 2026

**No destructive changes. No tables created, dropped, or altered by this
session's work** — every table this session's code writes to
(`bookings`, `payments`, `refunds`, `services`, `service_categories`,
`consumer_addresses`, `consumer_profiles`, `job_dispatches`,
`blocked_matches`, `partner_service_categories`, `partner_languages`,
`booking_status_history`, `chat_threads`, `chat_messages`) **already existed
live** in `servisakudb` before this session touched it, built by another
team member. This session only added SQLAlchemy model mappings for them,
plus two ORM-level-only additive columns on existing models
(`consumer_profiles.preferred_partner_language` was already a live column,
just newly mapped — same for everything else here).

## The key discovery

While booting the app after building an initial Stripe-based, job-centric
Payment Gateway (per the master prompt's literal Stripe/Razorpay/PayPal
instruction), `Base.metadata.create_all()` reported `payments` and `refunds`
as already present. Both had 0 rows, so nothing was at risk, but their real
shape was completely different from what was being built:

| | Originally built (discarded) | Actually live |
|---|---|---|
| Payment keyed on | `jobs.id`, `customers.id`, `partners.id` | `bookings.id`, `consumer_profiles.id` |
| Gateway | Stripe (hardcoded) | `payment_gateway` enum: `IPAY88`, `BILLPLZ` |
| Escrow | Separate `earnings.escrow_status` (this app's existing model) | `payments.status` itself: `HELD_IN_ESCROW`, `RELEASED` |
| Refunds | Simple full/partial, admin-only | Full approval workflow: `REQUESTED → PENDING_APPROVAL → APPROVED → PROCESSING → COMPLETED/REJECTED/FAILED` |

This was discarded and rebuilt against the real schema (see `GIT_COMMITS.md`
— commit `6b2b4aa` describes the discovery and rebuild in full).

## Tables newly mapped this session (all pre-existing, zero rows before and — for most — still zero after)

| Table | Rows before | Rows after | Owner | Notes |
|-------|------------:|-----------:|-------|-------|
| `bookings` | 0 | 1 (seed data) | Booking Engine module | Minimal mapping — 34 live columns, only what's needed for payments |
| `payments` | 0 | 0 | Booking Engine module | No real payment made yet (Billplz credentials pending) |
| `refunds` | 0 | 0 | Booking Engine module | |
| `services` | 0 | 1 (seed data) | Admin Catalog module | One sample service seeded under the existing "Home Cleaning" category |
| `service_categories` | 6 (pre-existing, real) | 6 (unchanged) | Admin Catalog module | Read-only — never written to |
| `consumer_addresses` | 0 | 1 (seed data) | Consumer module | |
| `consumer_profiles` | 0 | 1 (seed data) | Consumer module | Now writable (was read-only before this session, for reviews only) |
| `device_tokens` | 0 | 1 (test data from verification, see below) | (this session, Stage 3) | |
| `notification_logs` | 0 | several (verification attempts) | (this session, Stage 3) | All `FAILED` — no real provider configured yet, exactly as expected |
| `notification_preferences` | 0 | 2 (auto-created during verification) | (this session, Stage 3) | Auto-created with defaults on first access per user |

## Second discovery: the database grew substantially between Stage 2 and Stage 3

Before writing any Stage 3 code, a fresh full-table listing (same discipline
as the Stage 1 discovery) found the live database had grown from the 83
tables inventoried in Stage 1/2 to a much larger, different set — other team
members' concurrent work on Booking Engine/Admin/Training/B2B modules. New
tables directly relevant to this stage: `device_tokens`,
`notification_logs`, `notification_preferences` — all empty, all a clean
match for exactly what Stage 3 needed (device registration, per-channel
delivery logging with a `notification_status` enum
`QUEUED/SENT/DELIVERED/FAILED/BOUNCED`, and per-category/per-channel
preferences). Also newly visible: `payment_transactions`, `escrow_transactions`
(unrelated, empty — appear to be another team member's parallel/exploratory
payment work, not used by this module), and `bookings_legacy_stub`/
`reviews_legacy_stub`/`notifications_legacy_stub` (empty, vestigial).

**Confirmed nothing already built had drifted**: `payments` (still 16
columns), `refunds` (14), `bookings` (34, now correctly showing the 1 row
seeded in Stage 1), `reviews` (11), and `notifications` (12, still 4 rows)
all matched exactly what Stage 1/prior-session work had already mapped. No
re-reconciliation was needed — only additive new models for the three new
tables.

## Third discovery: schema re-checked fresh after the repository migration — unchanged

Before writing any Stage 4 code (and again per the explicit "other team
members may have changed it" instruction), the live schema was re-queried
from scratch in the new `servisaku-partner-consumer/backend/` location: still
83 tables, identical column-for-column to the Stage 3 baseline. No drift.

Tables newly mapped this stage, all pre-existing and empty beforehand:

| Table | Rows before | Rows after | Notes |
|-------|------------:|-----------:|-------|
| `job_dispatches` | 0 | several (test offers, all real dispatch attempts from live verification) | Doubles as both the active offer queue and the permanent dispatch log |
| `blocked_matches` | 0 | 1 (test block, from live verification) | |
| `partner_service_categories` | 0 | 2 (seed data — both test partners linked to "Home Cleaning") | |
| `partner_languages` | 0 | 3 (seed data) | FK to the pre-existing `languages` reference table — codes are `bm`/`en`/`ta`/`zh`, **not** `ms` (discovered via live FK violation, then fixed in `seed.py`) |
| `booking_status_history` | 0 | several (test transitions) | Append-only log of every `booking_status` change |
| `chat_threads` | 0 | several (test threads, auto-created on partner assignment) | |
| `chat_messages` | 0 | several (test messages) | |

`partners.home_location` and `consumer_addresses.location` (PostGIS
`geography` columns, present since Stage 1 but never populated by any
code) were populated for the two seed test partners and the seed test
consumer address via `seed.py`, using `ST_MakePoint`/`ST_SetSRID` — the
first real use of these columns.

**Confirmed nothing already built had drifted**: `payments`, `refunds`,
`bookings`, `reviews`, `notifications`, `device_tokens`,
`notification_logs`, `notification_preferences` all still matched exactly
what Stages 1–3 had mapped.

## Model reconciliation carried over from the prior session (not new today, included for completeness)

`auth_users` → shared `users` table; `Partner`/`PartnerDocument`/
`PartnerAvailability` column-level fixes; `Review`/`Notification` rewrites;
one additive nullable column, `jobs.booking_id` — see commit `609a825`.

## What still isn't unified

- **`jobs` vs `bookings`**: this app's own `jobs` table and the shared
  `bookings` table remain parallel, unconnected structures (explicitly
  deferred in the prior session, now confirmed to matter more than expected
  — payments live on `bookings`, not `jobs`).
- **Two escrow models**: this app's own `earnings.escrow_status` (for
  partner payouts via DuitNow) and the shared `payments.status` (for
  consumer payment collection via Billplz/iPay88) are not connected. A
  `RELEASED` payment does not currently flow into this app's own wallet
  ledger — bridging them requires the jobs↔bookings unification above,
  which is out of scope for the Payment Gateway stage.

## A timezone data-integrity issue discovered this stage (not a schema problem — a driver behavior)

Not a database structure issue, but worth recording here since it's about
how data actually lands in `timestamptz` columns: `asyncpg` silently
interprets a **naive** Python `datetime` as being in the *local system's*
timezone (not UTC) when binding it to a `timestamptz` column, even though
this DB session's own `TimeZone` GUC is `UTC`. Verified directly with a
round-trip test (`SELECT CAST(:ts AS timestamptz)`) — a naive
`datetime.utcnow()` value came back shifted by exactly the local dev
machine's UTC offset (+5:30, IST). Every `datetime.utcnow()` call anywhere
in this codebase writing to a `DateTime(timezone=True)` column has been
doing this silently since Stage 1. Fixed in all of this stage's own code
(`datetime.now(timezone.utc)` throughout); flagged as a follow-up for the
earlier stages' code, which was out of scope to modify here. Full detail in
`docs/SMART_DISPATCH.md`.

## Verification

Confirmed via direct `information_schema` queries against the live database
(not assumed) before writing any model code: column names, types,
nullability, enum values, and foreign key constraints for every table
listed above. `seed.py` re-run twice to confirm idempotency (both for
Stage 1–3's tables and again after adding the Stage 4 seed functions).
