# Smart Dispatch — Design & Operations Guide

Stage 4. Automatically finds, ranks, and offers a booking to nearby qualified
partners in sequence, with expiration/retry, manual override, and full
assignment history — all against the live `servisakudb` schema, using tables
that were already present (and empty) before this stage: `job_dispatches`,
`blocked_matches`, `partner_service_categories`, plus a new ORM mapping for
`partner_languages` and `booking_status_history`.

## Trigger

Dispatch starts automatically the moment a booking's payment is confirmed
(`routes/payments.py::_mark_payment_paid`, when `booking_status` transitions
`PENDING_PAYMENT -> CONFIRMED`). It only fires if the booking has no
`partner_id` yet. Admins can also (re)start it manually:
`POST /dispatch/bookings/{id}/start`.

## Candidate pipeline (`services/dispatch/matching.py`)

Executed in this order for every dispatch attempt:

1. **Nearby Partner Search** — raw SQL (`ST_Distance`/`ST_DWithin` against
   `partners.home_location` and `consumer_addresses.location`, both PostGIS
   `geography` columns intentionally left unmapped in the ORM), index-
   accelerated via the live `idx_partners_geo`/`idx_consumer_addr_geo` GiST
   indexes. Filtered to `status='ACTIVE' AND is_available=true`.
2. **Service Radius Filtering** — baked into the same SQL: `ST_DWithin(...,
   LEAST(partner.service_radius_km, DISPATCH_SEARCH_RADIUS_KM_CAP) * 1000)`.
3. **Availability Checking** — the booking's `scheduled_date.weekday()` and
   slot times must fall inside an active `partner_availability` row.
4. **Skill Matching** — the partner must have an active
   `partner_service_categories` row for the booking's service's category.
5. **Blocked-match exclusion** — via `blocked_matches` (consumer→partner).
6. **Already-tried exclusion** — any partner with an existing
   `job_dispatches` row for this booking is skipped (this is what makes
   retry advance to a *new* candidate instead of re-offering the same one).
7. **Workload cap** — partners already at `max_jobs_per_day` active bookings
   for that date are excluded entirely (not just penalized).
8. **Scoring** (0–100 each dimension):
   - `proximity_score = 100 * (1 - distance_km / service_radius_km)`
   - `rating_score` = `average_rating/5 * 100`, or a neutral **50** if
     `rating_count == 0` (avoids unfairly rewarding/punishing brand-new
     partners with a possibly-stale seeded `average_rating`)
   - `completion_score` = `completion_rate` directly, or a neutral **70** if
     `total_completed_jobs == 0`
   - `language_score` = **100** if the consumer has no
     `preferred_partner_language`, or the partner speaks it; **30** otherwise
   - `workload_score` (used for weighting only, not persisted —
     `job_dispatches` has no such column) = `100 * (1 - active_jobs_today /
     max_jobs_per_day)`
   - `match_score = 0.35*proximity + 0.25*rating + 0.20*completion +
     0.15*language + 0.05*workload`
9. Sorted descending by `match_score`, capped at `DISPATCH_MAX_CANDIDATES`.

`GET /dispatch/bookings/{id}/candidates` (admin) runs this whole pipeline
read-only, for debugging/visibility — it creates no `job_dispatches` rows.

## Sequential offer queue (`services/dispatch/engine.py`)

Only **one** offer is ever active per booking at a time:

- `start_dispatch()` re-runs the candidate pipeline (already-tried partners
  are excluded automatically), creates one `PENDING` `job_dispatches` row for
  the top remaining candidate with `acceptance_deadline = now +
  DISPATCH_OFFER_TIMEOUT_SECONDS`, increments `bookings.dispatch_attempts`,
  and notifies the partner (push+email via the existing
  `services/notifications/dispatcher.py`, plus a real-time
  `dispatch:job_offer` Socket.IO event).
- `accept_offer()` — marks the row `ACCEPTED`, sets
  `bookings.partner_id`/`booking_status='PARTNER_ASSIGNED'`, opens a
  `chat_threads` row if one doesn't exist, notifies the consumer.
- `decline_offer()` — marks `DECLINED`, immediately calls `start_dispatch()`
  again (retry-next-candidate, no wait for the sweep).
- `run_expiry_sweep()` — finds every `PENDING` row past its
  `acceptance_deadline`, marks it `EXPIRED`, and retries the next candidate.
- If `start_dispatch()` finds no candidates left, or
  `dispatch_attempts >= DISPATCH_MAX_ATTEMPTS`, the booking is left
  `CONFIRMED` with no partner and the consumer gets a "still finding you a
  partner" notification — this never silently fails or crashes the request.
- `manual_override()` (admin) — expires any pending offer, force-assigns a
  specific partner (row inserted/updated with `status='ACCEPTED'`, scores
  left `null` to mark it as a non-algorithmic assignment), same
  chat-thread/notification side effects as a normal accept.

`job_dispatches` doubles as **both** the active offer queue *and* the
permanent dispatch log/assignment history — rows are never deleted, only
their `status` changes. `GET /dispatch/bookings/{id}/history` returns the
full ordered list.

## Background Dispatch Processing (`services/dispatch/background.py`)

An `asyncio.create_task` loop started in `main.py`'s lifespan, cancelled on
shutdown, running `run_expiry_sweep()` (via its own DB session) every
`DISPATCH_SWEEP_INTERVAL_SECONDS` (default 20s) — independent of any single
HTTP request. `POST /dispatch/process-expired` (admin) runs one sweep cycle
on demand, for ops/testing.

## Failure recovery

Every notification/event-emission call inside the dispatch engine is
isolated so a broken channel never breaks the triggering action (same
pattern as Stage 3's notification dispatcher). The background sweep loop
catches and logs any exception per iteration rather than dying — a single
bad row can't take down all future retries.

## Endpoints (`routes/dispatch.py`, prefix `/dispatch`)

| Method | Path | Role |
|---|---|---|
| GET | `/bookings/{id}/candidates` | admin — preview only, no side effects |
| POST | `/bookings/{id}/start` | admin — manual (re)start |
| GET | `/offers/pending` | partner — my current offers |
| POST | `/offers/{id}/accept` | partner |
| POST | `/offers/{id}/decline` | partner |
| GET | `/bookings/{id}/history` | consumer/partner (owner) or admin |
| POST | `/bookings/{id}/override` | admin — manual assignment |
| POST | `/matches/block` | consumer or admin |
| GET | `/analytics` | admin |
| POST | `/process-expired` | admin |
| PATCH | `/bookings/{id}/status` | partner (assigned) — EN_ROUTE/ARRIVED/IN_PROGRESS/COMPLETED/CANCELLED_BY_PARTNER, logged to `booking_status_history` |

## What was verified live (against real `servisakudb` data, real HTTP calls)

- Full ranking correctness: a partner 1.56km away outranked one 8.71km away
  (match_score 81.22 vs 65.01) with the exact expected score breakdown.
- Auto-trigger on payment confirmation (via a scripted call to the real
  `_mark_payment_paid`, since Billplz has no live sandbox credentials yet).
- Decline → automatic retry to the next-ranked candidate.
- **Genuine, unplanned live test of expiration + background processing**:
  a timing gap during manual testing let a real offer's deadline pass: the
  background sweep loop (running with zero manual intervention) correctly
  expired it, retried the next candidate, exhausted the candidate list, and
  sent the consumer a graceful "still finding you a partner" notification —
  proving the whole failure-recovery chain end-to-end, not just the happy path.
- Accept → `booking_status` becomes `PARTNER_ASSIGNED`, chat thread created.
- Full booking status progression `PARTNER_ASSIGNED -> EN_ROUTE -> ARRIVED ->
  IN_PROGRESS -> COMPLETED`, each transition logged to
  `booking_status_history`, `partners.total_completed_jobs` incremented.
- Manual override correctly expires a pending offer first, then force-assigns.
- `blocked_matches` correctly removes a partner from future candidate lists
  for that consumer.
- `/dispatch/analytics` returns correct aggregate numbers matching the above
  test activity.

## Two real bugs found and fixed during this verification

1. **Timezone bug (significant, pre-existing, codebase-wide)** — `asyncpg`
   silently interprets a **naive** Python `datetime` as being in the local
   system timezone (not UTC) when binding it to a `timestamptz` column, even
   though the DB session's own `TimeZone` is UTC. Discovered when a freshly
   -written `acceptance_deadline` round-tripped through Postgres came back
   shifted by exactly the local dev machine's UTC offset (+5:30, IST) — a
   direct Python comparison (`dispatch_row.acceptance_deadline <
   datetime.utcnow()`) then falsely concluded a brand-new offer had already
   expired. **Fixed in all of this stage's own code** by using
   `datetime.now(timezone.utc)` (tz-aware) everywhere instead of the naive,
   now-deprecated `datetime.utcnow()`. This bug pattern (`datetime.utcnow()`
   writing to a `DateTime(timezone=True)` column) exists throughout the rest
   of the codebase from earlier stages too (payments, auth, uploads,
   notifications) — it was out of scope to fix retroactively here, but is
   worth a dedicated follow-up pass, since on a server whose local timezone
   isn't UTC, every such timestamp is silently wrong.
2. **Logging crash risk** — `services/realtime/events.py`'s error-logging
   call used a keyword argument literally named `event=`, which collides
   with `structlog`'s own positional event-name parameter and raises
   `TypeError: ... got multiple values for argument 'event'` — meaning if a
   real subscriber handler ever raised an exception, logging that failure
   would itself crash and mask the original error. Fixed by renaming the
   kwarg to `event_name`.

Not yet verified: real concurrent-partner races (two partners responding to
the same offer simultaneously) — the sequential single-active-offer design
makes this low-risk (the unique `(booking_id, partner_id)` constraint plus
the `status != 'PENDING'` guard in accept/decline prevent a double-accept),
but no explicit concurrency test was run.
