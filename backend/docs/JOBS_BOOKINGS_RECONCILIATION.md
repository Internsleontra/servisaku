# Jobs vs Bookings — Reconciliation Analysis

**Status: analysis only.** Nothing in this document was implemented as code
during the Final Hardening stage — `jobs` and `bookings` were not merged,
dropped, renamed, or rewritten. This is a documented understanding of a
pre-existing architectural split, produced because it was explicitly flagged
as a Stage 9 "Future Improvements" item and the user asked for a reasoned
recommendation before any migration is attempted.

## Executive summary

This backend has **two parallel, disconnected representations of "a unit of
paid work"**: the `jobs` table (with its own customer/earnings/settlement
satellite tables) and the `bookings` table (with its own consumer/payment/
dispatch/chat satellite tables). They were never unified. Concretely:

- `jobs` rows are **only ever created by `seed.py`** — no route, service, or
  webhook in this codebase inserts a new `Job`. It is static seed data.
- `bookings` rows are created by the live consumer booking flow
  (`POST /consumer/bookings`) and are the table every feature built in
  Stages 1–9 (payments, Smart Dispatch, chat, admin, analytics) operates on.
- **When a booking reaches `COMPLETED` via `routes/dispatch.py`, no `Earning`
  row is created.** The wallet/earnings/settlement payout pipeline
  (`routes/wallet.py`, `routes/earnings.py`, `routes/admin_settlements.py`)
  reads exclusively from `jobs`/`earnings`, which only ever contains the
  static seed rows. **A partner who completes a real, Smart-Dispatch-assigned
  booking today has no system-driven path to being paid out for it.** This is
  the single most consequential finding in this analysis — not a theoretical
  risk, a currently-true gap, verified by reading every code path that
  writes to `earnings` (there is exactly one: `seed.py`).
- Symmetrically, `GET /jobs/new` / `GET /jobs/today` / `GET /jobs/completed`
  (the partner mobile app's original "my jobs" screens) only ever show the
  2–3 rows `seed.py` inserted. A partner who receives and accepts a live
  Smart Dispatch offer will not see it there — that flow lives entirely in
  `bookings` + Socket.IO `dispatch:*` events, never touching `jobs`.

## Current responsibility of `jobs`

`models/job.py`, plus its satellite tables `job_status_log`, `job_photos`.

| Concern | Table(s) | Notes |
|---|---|---|
| Identity of who's being served | `customers` (`jobs.customer_id`) | A standalone table (`id, full_name, phone, avatar_url, rating`) — **not** linked to `users` or `consumer_profiles` in any way |
| Service/pricing snapshot | `jobs` itself | `category_id`, `service_name`, `package_name`, `addons[]`, `gross_amount`/`platform_fee`/`payout` stored as flat columns on the row, not references to `services`/`pricing_rules` |
| Status machine | `jobs.status` (free string) + `job_status_log` | Values used by `routes/jobs.py`: `requested → accepted → in_progress → completed` (partner-driven, no consumer/payment gate) |
| Photos | `job_photos` | before/after/general, uploaded via `POST /uploads/jobs/{job_id}/photos` |
| Earnings/payout | `earnings` (`earnings.job_id`, unique FK) | `escrow_status` (held/released/settled) lives here, independent of `payments.status` |
| Payout settlement | `settlements`, `settlement_items` | `routes/wallet.py` (partner self-withdraw) and `routes/admin_settlements.py` (admin-initiated) both bundle `earnings` rows only |
| Reviews (partial) | `job_status_log`/rating fields | `jobs.rating_given` exists as a column, separate from the unified `reviews` table below |

**Consuming routes:** `routes/jobs.py`, `routes/earnings.py`, `routes/wallet.py`,
`routes/uploads.py` (job-photo endpoints), `routes/reviews.py` (secondary
lookup only, see below).

## Current responsibility of `bookings`

`models/booking.py`, plus its satellite tables `booking_status_history` and
everything built in Stages 1–9.

| Concern | Table(s) | Notes |
|---|---|---|
| Identity of who's being served | `consumer_profiles` (`bookings.consumer_id`) | FK's to `users.id` — the real, shared identity table every other Stage 1–9 feature (auth, RBAC, admin) uses |
| Service/pricing | `services`, `pricing_rules`, `surge_pricing_rules` (referenced, not duplicated) | `bookings.service_id` is a real FK; amounts (`subtotal_rm`, `surge_multiplier`, `discount_rm`, `tax_rm`, `total_amount_rm`) are computed and stored per-booking but the catalog itself is normalized |
| Status machine | `bookings.booking_status` (Postgres enum, 13 values) + `booking_status_history` | `PENDING_PAYMENT → CONFIRMED → PARTNER_ASSIGNED → EN_ROUTE → ARRIVED → IN_PROGRESS → COMPLETED`, plus cancellation/dispute/refund terminal states |
| Payment/escrow | `payments`, `refunds` | Billplz/iPay88 gateway integration, `payments.status` (`HELD_IN_ESCROW`/`RELEASED`/`REFUNDED`/...) — entirely separate from `earnings.escrow_status` above |
| Assignment | `job_dispatches` (Smart Dispatch) | Sequential offer queue, scoring, expiry/retry — see `docs/SMART_DISPATCH.md`. Despite the table name (`job_dispatches`, pre-existing before this backend), it dispatches **bookings**, not `jobs` rows |
| Real-time | Socket.IO `dispatch:*`/`chat:*` events (`services/realtime/`) | Keyed by `booking_id` throughout |
| Chat | `chat_threads`/`chat_messages` | `models/chat.py`: `booking_id` FK, `UniqueConstraint` (one thread per booking) |
| Reviews | `reviews` (unified bidirectional table) | `reviews.booking_id` FK, `ondelete="CASCADE"` |
| Notifications | `notifications.booking_id` | Nullable FK, populated whenever a booking-domain event fires a notification |
| Admin oversight | `routes/admin_bookings.py`, `routes/admin_dashboard.py`, `routes/analytics.py` | All admin/analytics work built in Stage 6/7 reads `bookings`, not `jobs` |

**Consuming routes:** `routes/consumer.py`, `routes/payments.py`,
`routes/dispatch.py`, `routes/chat.py`, `routes/admin_bookings.py`,
`routes/admin_dashboard.py`, `routes/admin_users.py`, `routes/analytics.py`,
`services/dispatch/*`, `services/realtime/socket_server.py`.

## Overlapping fields

Both tables independently model the same real-world concept ("a scheduled
service visit") with incompatible shapes:

| Concept | `jobs` | `bookings` |
|---|---|---|
| Customer/consumer | `customer_id → customers.id` (standalone) | `consumer_id → consumer_profiles.id → users.id` (shared identity) |
| Status | free `varchar` (`requested`/`accepted`/...) | Postgres enum `booking_status` (13 values, richer state machine) |
| Scheduling | `scheduled_date` + `time_slot` (free string) | `scheduled_date` + `time_slot` (Postgres enum) + explicit `slot_start_time`/`slot_end_time` |
| Address | `address_label`/`address_full` (flat strings) | `address_id → consumer_addresses.id` (normalized, reusable) |
| Money | `gross_amount`/`platform_fee`/`payout` (partner payout view) | `subtotal_rm`/`surge_multiplier`/`discount_rm`/`tax_rm`/`total_amount_rm` (consumer pricing view) — **neither side stores the other's fields** |
| Completion timestamp | `jobs.completed_at` | `bookings.completed_at` — two independently-set columns for what should be one event |
| Partner assignment | `jobs.partner_id` (set once, no history) | `bookings.partner_id` + full `job_dispatches` offer history |

There is a partial, unused bridge: `jobs.booking_id` (nullable, added
specifically so reviews/notifications *could* link a job to a booking — see
the docstring in `models/job.py`). **No code path ever sets it.** A
consequence: `routes/reviews.py`'s enrichment query
(`select(Job).where(Job.booking_id.in_(booking_ids))`) will always return an
empty result set against current data — it degrades gracefully (falls back
to `job_id=r.booking_id` in the response) rather than erroring, but it is
effectively dead code today.

## Foreign key dependencies

```
customers ◄──────────── jobs ──────────► partners
                          │                  ▲
                          ├── job_status_log │
                          ├── job_photos     │
                          └── earnings ──────┘── settlements / settlement_items
                               (job_id, UNIQUE)

users ◄── consumer_profiles ◄── bookings ──► partners
              ▲                   │             ▲
              │                   ├── payments ──┴── refunds
consumer_addresses ◄──────────────┤
services ◄────────────────────────┤
              │                   ├── job_dispatches (Smart Dispatch)
              │                   ├── chat_threads / chat_messages
              │                   ├── reviews (also → users twice: reviewer/reviewee)
              │                   ├── notifications (nullable)
              │                   └── booking_status_history
```

`jobs.booking_id` is drawn separately above as a dangling, unpopulated
pointer — it is not a real FK constraint at the database level (deliberately
not declared, since this app doesn't own `bookings` and the column is
nullable/best-effort per the `models/job.py` docstring).

## Payment dependencies

Two entirely separate money pipelines exist and never intersect:

1. **Consumer-facing (bookings domain):** `bookings → payments → refunds`.
   Billplz/iPay88 gateway, escrow held on `payments.status`, refund
   approval workflow (Stage 6 admin endpoints). This is the pipeline every
   Stage 1–9 feature was built against.
2. **Partner-facing (jobs domain):** `jobs → earnings → settlements /
   settlement_items`. Partner wallet balance, withdrawal requests
   (`routes/wallet.py`), admin-initiated settlements
   (`routes/admin_settlements.py`). This pipeline only ever contains the
   `earnings` rows `seed.py` inserted for the two seeded jobs.

**There is no code anywhere that creates an `Earning` row from a completed
`Booking`.** A partner's wallet balance and settlement history today reflect
only seed data, regardless of how many real bookings they complete through
Smart Dispatch. This is the most important risk item in this document — see
Recommended long-term source of truth below.

## Dispatch dependencies

Smart Dispatch (`services/dispatch/`, Stage 4) is built entirely on
`bookings` + `job_dispatches`: candidate search, scoring, sequential offer
queue, expiry/retry, manual override — all keyed by `booking_id`. It has no
awareness of the `jobs` table at all (confirmed: no `services/dispatch/*.py`
file imports `models.job`). `jobs.partner_id` is a static, one-time
assignment made only by `seed.py`; there is no dispatch mechanism for the
`jobs` domain.

## Chat dependencies

`chat_threads`/`chat_messages` (`models/chat.py`) are booking-only —
`booking_id` is a `NOT NULL`, `UNIQUE` FK. There is no job-based chat and
none is planned; this is unambiguous.

## Mobile/API dependencies

This is where the split has the most direct user-facing impact. The
original partner mobile app's core "my jobs" experience —
`GET /jobs/new`, `GET /jobs/today`, `GET /jobs/completed`,
`POST /jobs/{id}/accept`, `PATCH /jobs/{id}/status`, job-photo uploads,
earnings breakdowns, wallet balance — is entirely `jobs`-domain. Meanwhile
every *new* capability delivered by this backend (real-time offers, chat,
payments, reviews, admin oversight) is `bookings`-domain and reaches the
partner exclusively through Socket.IO `dispatch:offer` events and the
`routes/dispatch.py` accept/decline endpoints, **not** through
`routes/jobs.py`.

Practical consequence: a partner mobile client wired up against the original
`/jobs/*` screens today will never display a real Smart-Dispatch-assigned
booking, and a client wired up against the new dispatch/chat/payment
endpoints has no reason to ever call `/jobs/*`. Both surfaces are live and
documented in Swagger, but they describe two different, non-overlapping
sets of real-world work for the same partner.

## Risks of merging them

- **Identity mismatch is the hard blocker.** `jobs.customer_id → customers`
  is structurally incompatible with `bookings.consumer_id →
  consumer_profiles → users`. Any merge requires first resolving who a
  `jobs`-domain customer *is* in terms of the shared `users` table — there
  is currently no mapping between the two, and `customers.phone` is the only
  plausible join key (unverified for uniqueness/collisions against
  `users.phone_number`).
- **Status vocabularies don't line up 1:1.** `bookings.booking_status` has
  richer states (`EN_ROUTE`, `ARRIVED`, `PARTNER_NO_SHOW`, `DISPUTED`, etc.)
  that `jobs.status` has no equivalent for, and vice versa isn't an issue
  (jobs' 4-state machine is a subset) — but any merge changes `jobs.status`
  semantics for whoever still reads it.
- **Money fields are shaped for opposite audiences.** `jobs` stores the
  partner payout view (`gross_amount`/`platform_fee`/`payout`); `bookings`
  stores the consumer pricing view (`subtotal_rm`/`surge_multiplier`/
  `tax_rm`/`total_amount_rm`). Neither is a superset of the other.
  `earnings.job_id` is `UNIQUE NOT NULL` — repointing it at `bookings` isn't
  a rename, it changes a core payout invariant (one earning per completed
  unit of work) and needs a real backfill decision for the historical rows.
- **This backend does not own either table.** Both `jobs`/`customers` and
  `bookings`/`consumer_profiles`/`payments` are shared, live production
  tables (per `docs/ARCHITECTURE.md` — this backend owns none of its tables
  exclusively). A migration here is a cross-team decision requiring
  coordination with whoever else reads/writes these tables, not something
  this backend can safely execute unilaterally.
- **Blast radius of doing nothing is asymmetric.** The missing
  booking→earnings link (see Payment dependencies) is a live correctness
  gap affecting real partner payouts today; the unused `jobs.booking_id`
  bridge column and dead reviews-enrichment code path are comparatively
  low-risk cosmetic issues.

## Recommended long-term source of truth

**`bookings` should become the single source of truth.** It is the actively
developed, fully integrated domain — every feature built in Stages 1–9
(payments, dispatch, chat, admin, analytics, RBAC, notifications) already
depends on it, and `consumer_profiles`/`users` is the real shared identity
model the rest of the platform uses. `jobs`/`customers`/`earnings` should be
treated as the legacy surface to phase out, not the target to converge on.

The one exception: **the payout mechanics on the `jobs` side
(`earnings`/`settlements`/`settlement_items` + `routes/wallet.py`) are more
mature than anything equivalent on the `bookings` side** — `bookings` has no
payout pipeline at all today, only consumer-side escrow. That machinery is
worth *reusing*, just re-pointed at `bookings.id` instead of `jobs.id`.

## Safe migration strategy

A phased, additive approach — no big-bang rewrite, no dropped columns until
the last step, each phase independently shippable and reversible:

1. **Close the payout gap first (highest-value, lowest-risk step).** Add a
   nullable `earnings.booking_id` column (mirroring the existing
   `jobs.booking_id` precedent) and make booking completion
   (`routes/dispatch.py`, the `COMPLETED` transition) create an `Earning`
   row keyed by `booking_id` instead of (or in addition to) `job_id`. This
   alone fixes the "partners aren't getting paid for real bookings" gap
   without touching the `jobs` table at all. Requires `earnings.job_id`'s
   `NOT NULL` constraint to be relaxed first (schema change, needs the
   table owner's sign-off).
2. **Backfill identity, not data.** Establish (with whoever owns
   `customers`/`consumer_profiles`) whether every `customers` row has a
   corresponding `users`/`consumer_profiles` row, or whether `customers` can
   simply be deprecated in favor of `consumer_profiles` for all *new*
   activity while historical `jobs` rows keep their existing
   `customer_id` untouched.
3. **Freeze `jobs` as read-only history.** Once step 1 ships, stop treating
   `jobs` as a place new work can originate (it already isn't, in
   practice — see Executive summary) and document it explicitly as a
   historical/legacy table. `routes/jobs.py`/`routes/earnings.py` continue
   to serve existing seed/historical data unchanged; no client-facing
   contract breaks.
4. **Migrate mobile client screens incrementally.** Point the partner
   mobile app's "my jobs" UI at the `bookings`/dispatch endpoints
   (`routes/dispatch.py`, `routes/consumer.py`-adjacent partner views) one
   screen at a time, keeping `/jobs/*` alive until the client no longer
   calls it.
5. **Only then consider schema cleanup** — e.g. dropping the now-dead
   `jobs.booking_id` bridge column, or archiving `jobs`/`job_status_log`/
   `job_photos`/`customers` — and only with explicit approval from whoever
   owns those tables, per this project's standing rule to never drop or
   redesign shared production tables unilaterally.

Each step is independently useful, none requires a maintenance window, and
step 1 alone resolves the most consequential finding in this document.
