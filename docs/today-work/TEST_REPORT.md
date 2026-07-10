# Test Report — 10 July 2026

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

## Full regression pass (after all three stages)

`GET /partner/me`, `GET /jobs/today`, `GET /wallet/balance`, `GET /reviews`,
`GET /notifications`, `GET /notifications/unread-count`,
`GET /consumer/bookings`, `GET /payments/transactions`,
`GET /uploads/kyc-documents`, `GET /feedback`, `GET /openapi.json`,
`GET /docs` — all returned `200`. Zero regressions from any stage's changes.

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
