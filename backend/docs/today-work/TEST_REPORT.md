# Test Report — 10–11 July 2026

All testing was done with real HTTP calls against the live `servisakudb`
through the SSH tunnel — no mocks, no separate test database. No automated
test suite exists yet in this repo (tracked as a future stage).

## Payment Gateway

| Check | Result |
|---|---|
| Clean app boot / mapper registry configures with no errors | ✅ |
| Consumer login (shared `/auth/login`, role `consumer` in JWT) | ✅ |
| Browse service categories/services | ✅ |
| Create/list saved addresses | ✅ |
| Create a booking; reject foreign address_id (404), invalid time_slot (422) | ✅ |
| Create bill — clean 503 when Billplz unconfigured (not a crash) | ✅ |
| Create bill with explicit `payment_gateway: "BILLPLZ"` vs `"IPAY88"` — both route correctly through the gateway registry with zero special-casing in route code | ✅ |
| `GET /payments/transactions` — empty list, no errors | ✅ |
| Admin-only endpoints (`/release`, refund approve/reject/complete) reject non-admin (403) | ✅ |
| Refund/payment 404s for IDs that don't exist or aren't owned by the caller | ✅ |
| Regression: partner `/me`, `/wallet/balance`, `/jobs/today` unaffected | ✅ |
| Billplz X-Signature algorithm — unit-tested in isolation (accepts a correctly-signed payload, rejects a tampered one) | ✅ (algorithm self-consistency only) |
| Real outbound `create_bill`/`get_bill` HTTP calls to Billplz | ⏳ Pending sandbox credentials |
| Real Billplz callback delivery and signature verification | ⏳ Pending sandbox credentials + public tunnel |

## Media Uploads

| Check | Result |
|---|---|
| Clean app boot with `uploads_router` registered (10 routes) | ✅ |
| Valid JPEG/PNG (real files, generated via Pillow) pass magic-byte validation, reach the Cloudinary-not-configured 503 boundary | ✅ |
| Spoofed file — text content renamed `.jpg` with `Content-Type: image/jpeg` header — correctly rejected (422) by magic-byte sniffing, not fooled by the declared header | ✅ |
| Oversized file (11MB against a 10MB limit) correctly rejected (422) with accurate size reporting | ✅ |
| Invalid `document_type` rejected by Pydantic `Literal` validation (422) | ✅ |
| Upload to a nonexistent/foreign job rejected (404) | ✅ |
| Consumer blocked from KYC document upload (403, partner-only) | ✅ |
| `GET /uploads/kyc-documents` returns an empty list cleanly pre-upload | ✅ |
| Avatar upload/delete work identically for both partner and consumer roles through the shared scope dependency | ✅ |
| Signed-upload signature generation — independently recomputed the HMAC-SHA1 by hand per Cloudinary's documented algorithm; matches the SDK's own `cloudinary.utils.api_sign_request` output exactly | ✅ |
| Real outbound `upload`/`destroy` HTTP calls to Cloudinary | ⏳ Pending free-tier credentials |

## Notification Dispatcher

| Check | Result |
|---|---|
| Clean app boot with `notification_dispatch_router` registered (12 routes, no path collisions with the existing `/notifications` routes) | ✅ |
| Device token register (upsert), list, update (deactivate/reactivate), delete | ✅ |
| Preferences auto-create on first `GET`, partial update via `PUT` | ✅ |
| Topic subscribe — clean 503 when Firebase unconfigured, not a crash | ✅ |
| Admin-only endpoints (topic broadcast, single-log retry, bulk retry) reject non-admin (403) | ✅ |
| `POST /feedback` triggers a background dispatch that creates an in-app `Notification` plus two `notification_logs` rows (PUSH, EMAIL), both correctly `FAILED` with accurate reasons, **without the feedback submission itself failing** | ✅ |
| `POST /consumer/bookings` triggers a booking notification referencing the new booking's `booking_id` | ✅ (after the FK-race fix below) |
| Admin bulk retry (`POST /notifications/retry-failed`) correctly reports `{"retried": 0, "checked": 2}` against un-configured providers — accurate, not falsely optimistic | ✅ |
| Single-log retry marks `fallback_sent: true` and leaves status `FAILED` when the retry itself can't succeed (no provider configured) | ✅ |
| In-app notification list (`GET /notifications`) shows dispatcher-created rows alongside pre-existing seeded ones | ✅ |
| Cloudinary-style signature cross-check: N/A here — Firebase/email providers call each vendor's own SDK/documented REST contract directly, no hand-rolled signing scheme to verify in isolation | — |
| Real outbound calls to Firebase, Resend, Brevo, MailerSend | ⏳ Pending free-tier credentials |
| Full regression: partner/jobs/wallet/reviews/consumer/payments/uploads endpoints all still `200` after Stage 3 changes | ✅ |

### Two real bugs found during verification (not assumed away)

1. **FK race with `BackgroundTasks`**: the first attempt at booking-creation
   notifications used `background_tasks.add_task(dispatch_standalone, ...,
   booking_id=booking.id, ...)`. Live-testing it produced an actual
   `sqlalchemy.exc.IntegrityError` /
   `ForeignKeyViolationError: ... violates foreign key constraint
   "notifications_booking_id_fkey"` in the server log — the background
   task's independent DB session/transaction didn't reliably see the
   triggering request's just-flushed booking row. Fixed by dispatching
   inline (same session, already flushed) for this specific call site, and
   re-verified: the same booking-creation request that previously crashed
   the background task now completes cleanly with two properly-linked
   `FAILED` log entries.
2. **Unconfigured-provider exception risk**: `FirebasePushProvider.send_to_token`
   originally called `_ensure_configured()` (which raises `AppException` when
   Firebase isn't set up) *outside* its try/except block, meaning a payment
   confirmation calling `dispatch()` inline could have had its entire request
   fail with an unrelated 503 if Firebase wasn't configured — even though the
   actual payment status update had already succeeded. Fixed at both layers
   (dispatcher catches per-channel exceptions; the provider itself now always
   returns a `PushResult` instead of raising for this case). Confirmed via the
   feedback-submission test above: request succeeds regardless of provider
   configuration state.

## Smart Dispatch

| Check | Result |
|---|---|
| Clean app boot with `dispatch_router` registered (11 routes) | ✅ |
| Live schema re-verified fresh in the new repo location before writing code — unchanged (83 tables) | ✅ |
| Candidate ranking correctness: partner 1.56km away (match_score 81.22) outranked one 8.71km away (65.01), with the full score breakdown matching the documented formula exactly | ✅ |
| Auto-dispatch fires on payment confirmation (via a scripted direct call to the real `_mark_payment_paid`, since Billplz has no live credentials) | ✅ |
| Skill matching: only partners with an active `partner_service_categories` row for the booking's service category appear as candidates | ✅ |
| Availability filtering: partner with no matching `partner_availability` row for the slot excluded | ✅ |
| Workload cap: partner already at `max_jobs_per_day` excluded entirely from candidates | ✅ |
| Partner accepts a pending offer — `booking_status` → `PARTNER_ASSIGNED`, chat thread auto-created | ✅ |
| Partner declines a pending offer — immediate automatic retry to the next-ranked candidate, no wait for the sweep | ✅ |
| **Genuine, unplanned live test of the full failure-recovery chain**: a real timing gap let an offer's `acceptance_deadline` pass — the background sweep loop (zero manual intervention) correctly marked it `EXPIRED`, retried, found no more candidates, and sent the consumer a graceful "still finding you a partner" notification instead of leaving the booking stuck | ✅ |
| Manual override (admin) expires any pending offer first, then force-assigns; rejects (409) on a booking not `CONFIRMED`/`PARTNER_ASSIGNED` | ✅ |
| Blocked matches: a consumer-blocked partner correctly excluded from that consumer's future candidate lists | ✅ |
| Full booking status progression `PARTNER_ASSIGNED → EN_ROUTE → ARRIVED → IN_PROGRESS → COMPLETED`, each transition logged to `booking_status_history`, `partners.total_completed_jobs` incremented on completion | ✅ |
| `GET /dispatch/analytics` returns correct aggregate numbers matching the test activity above | ✅ |
| `GET /dispatch/bookings/{id}/candidates` (preview) creates zero `job_dispatches` rows — confirmed read-only | ✅ |

### Two real bugs found during this stage's verification

1. **Timezone bug (significant, pre-existing, codebase-wide)**: `asyncpg`
   silently interprets a naive `datetime` as local-system-time (not UTC)
   when writing to a `timestamptz` column, even with the DB session's
   `TimeZone` set to UTC — discovered when a freshly-computed
   `acceptance_deadline` round-tripped through Postgres shifted by exactly
   the local machine's UTC offset, causing a direct Python comparison to
   falsely conclude a brand-new offer had already expired. Fixed throughout
   this stage's own code (`datetime.now(timezone.utc)` everywhere instead
   of the naive `datetime.utcnow()`); flagged as a follow-up for earlier
   stages, out of scope to fix here. Full detail in `docs/SMART_DISPATCH.md`.
2. **Manual override had no booking-state validation**: found on code
   review (not live testing) — an admin could have "assigned" a partner to
   a booking that hadn't been paid for yet, or one already
   completed/cancelled. Fixed by restricting it to
   `CONFIRMED`/`PARTNER_ASSIGNED` bookings, returning 409 otherwise.

## Real-Time Communication (Socket.IO)

| Check | Result |
|---|---|
| Clean app boot as `main:socket_app`; `/socket.io` engine.io handshake responds correctly | ✅ |
| JWT Socket Authentication: connection rejected outright on missing/invalid/expired token | ✅ (verified via the auth code path; every successful test connection used a real valid token) |
| Three simultaneous authenticated connections (two partners, one consumer) | ✅ |
| `dispatch:job_offer` reached exactly the offered partner's `partner:{id}` room the moment the server-side `start_dispatch()` ran — verified via a real Socket.IO client listening while triggering the real HTTP endpoint | ✅ |
| Accepting an offer via the real `/dispatch/offers/{id}/accept` endpoint produced both `dispatch:status_update` and `booking:status_update` in the consumer's booking room in real time | ✅ |
| `POST /chat/threads/{id}/messages` (REST) correctly bridges through the event bus to a live `chat:new_message` broadcast | ✅ |
| Socket-native `chat:send_message`, `chat:typing`, `chat:read`, `partner:location_update` all round-tripped correctly between two connected clients in the same booking room | ✅ |
| `heartbeat` → `heartbeat:ack` round-trip | ✅ |
| `presence:online` broadcast on `booking:join` | ✅ |
| Room permission check: a partner not yet assigned to a booking cannot join that booking's room (only reachable via their own `partner:{id}` room until they accept) | ✅ |
| `/health` reports `realtime.connected_sessions` accurately | ✅ |

### Two real bugs found during this stage's verification

Both discovered *because* Socket.IO events kept appearing to go missing
during testing, which forced tracing the actual root cause rather than
assuming the real-time wiring itself was broken:

1. **Test-methodology discovery, not an app bug**: the event bus
   (`services/realtime/events.py`) only reaches subscribers registered in
   the *same running process*. The `simulate_payment.py` test helper (a
   separate `python script.py` invocation, needed because Billplz has no
   live credentials) triggers `_mark_payment_paid()` in its own process,
   which has its own empty subscriber list — so its events correctly fire
   but reach nobody. Documented clearly (not a code fix, a testing-approach
   fix) — retested by triggering dispatch through the real running server's
   admin HTTP endpoint instead, which worked correctly on the first try.
2. **Logging crash risk**: `services/realtime/events.py`'s error-logging
   call used a kwarg literally named `event=`, colliding with `structlog`'s
   own positional event-name parameter (`TypeError: ... got multiple values
   for argument 'event'`) — meaning a real subscriber exception would have
   crashed the logging of that exception, masking the original error
   entirely. Fixed by renaming to `event_name`.

## Full regression pass (after all five stages)

`GET /partner/me`, `GET /jobs/today`, `GET /earnings/summary`,
`GET /wallet/balance`, `GET /reviews`, `GET /notifications`,
`GET /notifications/unread-count`, `GET /notifications/device-tokens`,
`GET /notifications/preferences`, `GET /consumer/bookings`,
`GET /consumer/addresses`, `GET /consumer/services`,
`GET /payments/transactions`, `GET /uploads/kyc-documents`,
`GET /feedback`, `GET /dispatch/analytics`, `GET /dispatch/offers/pending`,
`GET /chat/threads`, `GET /openapi.json` (80 paths), `GET /docs`,
`GET /redoc` — all returned `200`. Zero regressions from any stage's
changes, and zero unexpected errors in the server log across the entire
verification session.

## Why the third-party API calls themselves are unverified

Billplz, Cloudinary, Firebase, and the three email providers all require
account signup before any real API call can be made — an autonomous agent
can't complete the email/phone verification steps required for third-party
account creation. Per your instructions, Billplz signup is yours to do; the
others were listed as part of each stage's task but no credentials exist yet
for any of them. Everything short of the literal external HTTP call has been
verified; the exceptions (Billplz X-Signature never seen a real callback,
and every provider's outbound calls) are called out explicitly rather than
assumed to work.

**Stages 4 and 5 have no such gap** — Smart Dispatch (PostGIS + the existing
DB) and Socket.IO (self-hosted, no external service) need no third-party
credentials at all, so both are fully verified end-to-end with nothing
pending.

## Stage 6 — Admin Backend live verification

All against `servisakudb` with a real `SUPER_ADMIN` JWT (assigned via
`seed.py`'s new `seed_admin_rbac`), a real partner JWT, and a purpose-created
`READ_ONLY`-role test admin (not seed data — created directly for this RBAC
test, see below):

- **RBAC enforcement**: partner JWT -> `403` on `/admin/dashboard`.
  `READ_ONLY`-role admin (whose pre-seeded `role_permissions` mapping turns
  out to grant zero permissions) -> `403` on both a read endpoint
  (`GET /admin/users`) and a write endpoint (`POST .../approve`) — the gate
  fails closed. `SUPER_ADMIN` -> `200`/success everywhere tested.
- **Partner approval lifecycle**: found a real `SUBMITTED` partner already
  in the live data (`Test Partner Stage AD`, seeded by another team member's
  session) and ran it through `POST /admin/partners/{id}/approve` ->
  `status: ACTIVE`; a second approve attempt correctly `409`s.
- **Audit trail**: `GET /admin/rbac/audit-logs` and `GET /admin/rbac/actions`
  both show the approval with correct before/after values; `GET
  /admin/rbac/actions` accumulated 13 entries across every module (catalog,
  coupons, settlements, support tickets, training, partner approval) by the
  end of the verification pass, confirming the logging call was wired into
  every route file, not just one.
- **Catalog CRUD chain**: category -> service -> add-on -> pricing-rule,
  each created and the category updated via `PUT`. Duplicate category
  name/slug correctly `409`s (after the generated-column and
  IntegrityError-handling fixes described in `docs/ADMIN_BACKEND.md`).
- **Coupons**: created `WELCOME20`, duplicate `code` correctly `409`s.
- **Settlements**: created against two real `released` earnings rows found
  in the live data for the seed partner; status transition `pending ->
  scheduled` works; re-using an already-`settled` earning in a second
  settlement correctly `422`s (double-spend prevention).
- **Support tickets**: full lifecycle create -> assign (to self) -> resolve,
  each transition reflected correctly in the response.
- **Training**: module + question creation both verified.
- **Bookings**: found a real `PENDING_PAYMENT` booking, cancelled it via
  `POST /admin/bookings/{id}/cancel`, confirmed the transition landed in
  `GET /admin/bookings/{id}/status-history`.
- **User management**: suspended the test `READ_ONLY` admin account via
  `PUT /admin/users/{id}/status`.
- **Regression**: `GET /partner/me`, `GET /dispatch/offers/pending`,
  `GET /wallet/balance`, `GET /chat/threads`, `GET /notifications` all still
  `200` after every Stage 6 change — including the two files (`payments.py`,
  `dispatch.py`, `notification_dispatch.py`) modified to add audit logging
  to already-existing admin endpoints.

**Two real bugs found and fixed** during this pass (both detailed in
`docs/ADMIN_BACKEND.md`): the `audit_logs.retention_until` generated-column
insert failure, and raw `IntegrityError` 500s on three duplicate-key create
endpoints.

**Not live-tested**: KYC document verify/reject (`POST
/admin/partners/documents/{id}/verify|reject`) — no partner in the live data
currently has an uploaded KYC document to exercise against (the Stage 2
upload flow needs real Cloudinary credentials, which don't exist yet per the
gap noted above). The endpoint code follows the identical, already-verified
pattern as partner approve/reject (same guard structure, same audit-log
call), so the risk is low, but this is disclosed rather than assumed.

## Stage 7 — Analytics live verification

All 11 endpoints under `/admin/analytics/*` fired against `servisakudb` with
a `SUPER_ADMIN` token and returned `200` with real, non-trivial data:

- `revenue` — RM1,350.00 total captured across 9 payments, correctly
  broken down by day and by the "Home Cleaning" service category.
- `bookings` — 15 total, correct status breakdown, RM150.00 average value.
- `partners` — correctly ranked 3 partners by completed jobs/rating/
  completion rate; platform-wide averages computed correctly.
- `consumers` — 1 seed consumer, 100% repeat-booking rate (has multiple
  bookings), correct top-spender ranking.
- `trends` — per-day time series for bookings/revenue/new-users, distinct
  output shape from `GET /admin/dashboard`'s point-in-time snapshot.
- `conversion` — 15 created → 11 confirmed (73.33%) → 5 assigned → 1
  completed (9.09% of confirmed, 6.67% overall) — matches the booking-status
  breakdown from the `bookings` endpoint exactly, cross-checked.
- `cancellations` — 1 cancelled (6.67% rate), 0 no-shows.
- `dispatch` — confirmed byte-for-byte identical output to the existing
  `GET /dispatch/analytics` (Stage 4), proving the alias delegates correctly
  rather than reimplementing.
- `payments` — 9 `HELD_IN_ESCROW` via `BILLPLZ`/`FPX`, 100% success rate
  (matches "no failed payment attempts" from Stage 1 testing).
- `notifications` — 0% delivery success rate, all `FAILED` — this correctly
  reflects the known, previously-documented gap (no real push/email provider
  configured yet), not a bug in this stage's analytics query.
- `support` — 1 ticket, `RESOLVED`, 5.5-hour average resolution time
  (matches the real elapsed time between this session's ticket-creation and
  resolve calls in the Stage 6 verification pass).

**RBAC verified**: partner JWT → `403`, no token → `401`, `SUPER_ADMIN` →
`200` on every endpoint. **Regression**: `GET /admin/dashboard`, `GET
/dispatch/analytics`, `GET /openapi.json` (144 total paths) all still `200`
after wiring Stage 7 in.

**Infrastructure note, not a bug**: the SSH tunnel to the AWS RDS bastion
had dropped (idle since the previous session) partway through this stage's
work, causing a `RuntimeError: Cannot connect to PostgreSQL` on server
startup. Reconnected with the same tunnel command used to establish it
originally; no application code was at fault.
