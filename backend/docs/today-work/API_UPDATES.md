# API Updates — 10–11 July 2026

54 new endpoints across 6 route groups (5 new, 1 extending the existing
Notifications group). Full request/response schemas and examples are in
Swagger UI (`/docs`) — this is a quick-reference summary. See
`backend/API_TESTING_REPORT.md` for verification status per endpoint.

## Consumer (`/api/v1/consumer/*`) — 6 endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/consumer/service-categories` | List active categories |
| GET | `/consumer/services` | List active services, optional `?category_id=` |
| POST | `/consumer/addresses` | Add a saved address |
| GET | `/consumer/addresses` | List saved addresses |
| POST | `/consumer/bookings` | Create a booking (`PENDING_PAYMENT`) |
| GET | `/consumer/bookings` | List my bookings |

## Payments (`/api/v1/payments/*`) — 11 endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/payments/bookings/{booking_id}/bill` | Create/reuse a gateway checkout bill (`payment_gateway`: `BILLPLZ` default, `IPAY88`) |
| POST | `/payments/billplz/callback` | Billplz webhook receiver (public, X-Signature auth) |
| GET | `/payments/transactions` | Merged payment+refund history |
| GET | `/payments/bookings/{booking_id}` | List payments for a booking |
| GET | `/payments/{payment_id}` | Get a payment |
| POST | `/payments/{payment_id}/sync` | Manually re-fetch status from the gateway |
| POST | `/payments/{payment_id}/release` | Admin: release escrow |
| POST | `/payments/{payment_id}/refunds` | Request a refund |
| POST | `/payments/refunds/{refund_id}/approve` | Admin: approve |
| POST | `/payments/refunds/{refund_id}/reject` | Admin: reject |
| POST | `/payments/refunds/{refund_id}/complete` | Admin: mark completed after manual gateway-side execution |

## Uploads (`/api/v1/uploads/*`) — 10 endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/uploads/avatar` | Upload partner/consumer avatar |
| DELETE | `/uploads/avatar` | Delete avatar |
| POST | `/uploads/kyc-documents` | Upload/replace a KYC document |
| GET | `/uploads/kyc-documents` | List my KYC documents |
| DELETE | `/uploads/kyc-documents/{document_id}` | Delete a KYC document |
| POST | `/uploads/jobs/{job_id}/photos` | Upload a job photo (`photo_type`: before/after/general) |
| GET | `/uploads/jobs/{job_id}/photos` | List a job's photos |
| DELETE | `/uploads/jobs/{job_id}/photos/{photo_id}` | Delete a job photo |
| POST | `/uploads/signature` | Get signed params for a direct-to-Cloudinary upload |
| POST | `/uploads/confirm` | Persist the result of a direct upload |

## Notification Dispatch (`/api/v1/notifications/*`) — 12 endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/notifications/device-tokens` | Register/reactivate a device token (upsert) |
| GET | `/notifications/device-tokens` | List my device tokens |
| PUT | `/notifications/device-tokens/{id}` | Update type/active flag |
| DELETE | `/notifications/device-tokens/{id}` | Remove a device token |
| GET | `/notifications/preferences` | Get my preferences (auto-creates defaults) |
| PUT | `/notifications/preferences` | Update preferences |
| POST | `/notifications/topics/subscribe` | Subscribe my devices to an FCM topic |
| POST | `/notifications/topics/unsubscribe` | Unsubscribe |
| POST | `/notifications/topics/{topic}/send` | Admin: broadcast to a topic |
| GET | `/notifications/logs` | My delivery history across all channels |
| POST | `/notifications/logs/{id}/retry` | Admin: retry one failed delivery |
| POST | `/notifications/retry-failed` | Admin: bulk retry recent failures |

## Smart Dispatch (`/api/v1/dispatch/*`) — 11 endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/dispatch/bookings/{id}/candidates` | Admin: read-only ranked candidate preview, no side effects |
| POST | `/dispatch/bookings/{id}/start` | Admin: manually (re)start dispatch for a confirmed, unassigned booking |
| GET | `/dispatch/offers/pending` | Partner: my current pending offers |
| POST | `/dispatch/offers/{id}/accept` | Partner: accept an offer (assigns booking, opens chat thread) |
| POST | `/dispatch/offers/{id}/decline` | Partner: decline (triggers immediate retry to next candidate) |
| GET | `/dispatch/bookings/{id}/history` | Full ordered dispatch/assignment log for a booking |
| POST | `/dispatch/bookings/{id}/override` | Admin: manually assign a specific partner, bypassing the queue |
| POST | `/dispatch/matches/block` | Consumer/admin: block a partner from future matching |
| GET | `/dispatch/analytics` | Admin: acceptance rate, avg attempts, avg response time, top partners |
| POST | `/dispatch/process-expired` | Admin: manually run one expiry-sweep cycle (mirrors the background worker) |
| PATCH | `/dispatch/bookings/{id}/status` | Partner: EN_ROUTE/ARRIVED/IN_PROGRESS/COMPLETED/CANCELLED_BY_PARTNER |

## Chat (`/api/v1/chat/*`) — 4 endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/chat/threads` | List my chat threads |
| GET | `/chat/threads/{id}/messages` | Message history, oldest first |
| POST | `/chat/threads/{id}/messages` | Send a message (REST fallback — primary path is Socket.IO) |
| POST | `/chat/threads/{id}/read` | Mark unread messages as read (REST fallback) |

## Socket.IO events (not REST, see `docs/SOCKET_ARCHITECTURE.md`)

Mounted at `/socket.io` via `main:socket_app`. Client→server:
`booking:join`/`booking:leave`, `heartbeat`, `chat:typing`,
`chat:send_message`, `chat:read`, `partner:location_update`. Server→client:
`presence:online`/`presence:offline`, `heartbeat:ack`, `chat:new_message`,
`chat:read_receipt`, `chat:typing`, `partner:location`, `dispatch:job_offer`,
`dispatch:status_update`, `booking:status_update`.

## Breaking changes

None — every existing endpoint's request/response shape is unchanged.

## Notable design decisions

- **Payment gateway is provider-agnostic** at the API level: `payment_gateway`
  in the bill-creation request body is a real, working switch, not a fixed
  default — verified by creating bills with both `BILLPLZ` and `IPAY88`
  values and confirming both route correctly (`IPAY88` reaches its
  not-yet-available stub, cleanly, with no special-casing anywhere in
  `routes/payments.py`).
- **Uploads support two flows** on purpose (the task asked for both): upload
  the file straight through this API (validated, simplest), or get a signed
  URL and upload directly to Cloudinary from the mobile client, then call
  `/uploads/confirm` — useful for large files on slow connections.
- **Notification delivery is best-effort and non-blocking by design**: a
  failing or unconfigured channel (e.g. Firebase not set up yet) never
  surfaces as an error to the triggering action — it's logged to
  `notification_logs` as `FAILED` instead, retryable later via
  `/notifications/retry-failed`. Confirmed live: submitting feedback with a
  registered device token but zero notification providers configured still
  returns `201`, with both the push and email attempts correctly logged as
  failed.
- **`GET /notifications/logs` vs. `GET /notifications`**: intentionally
  distinct. The former is the delivery-attempt log across push/SMS/email
  (with provider and status); the latter is the pre-existing in-app
  notification list. A single triggering event produces one row in the
  latter and up to three in the former (one per requested channel).
- **Dispatch is a strictly sequential single-offer queue**, not a
  broadcast-to-all-candidates model: only one `PENDING` `job_dispatches` row
  exists per booking at any time. Confirmed via live testing — declining an
  offer immediately creates exactly one new row for the next-ranked
  candidate, never more than one active offer simultaneously.
- **`job_dispatches` is both the live queue and the permanent log** —
  there's no separate "dispatch history" table; rows are never deleted, only
  their `status` changes (`PENDING → ACCEPTED/DECLINED/EXPIRED`). `GET
  /dispatch/bookings/{id}/history` is a plain read of this same table.
- **Manual override validates booking state** (`CONFIRMED` or
  `PARTNER_ASSIGNED` only) — added after review found the first version had
  no such check, which would have let an admin "assign" a partner to a
  booking that hadn't been paid for yet, or one already completed/cancelled.
- **Chat has two paths, functionally identical**: the Socket.IO events
  (`chat:send_message`/`chat:read`) and the REST endpoints both write to the
  same `chat_messages` rows and emit the same real-time broadcast — verified
  live that a message sent via REST arrives over an already-connected
  socket exactly like one sent socket-natively.
- **Presence and partner GPS location are intentionally not persisted** —
  no dedicated table exists for either in the live schema; both are
  in-memory/broadcast-only, matching their inherently ephemeral nature (see
  `docs/SOCKET_ARCHITECTURE.md`).

## Admin Backend (`/api/v1/admin/*`) — 73 endpoints, Stage 6

Full detail and the permission-per-group table are in `docs/ADMIN_BACKEND.md`.
Quick reference:

| Group | Prefix | Endpoints |
|---|---|---|
| Dashboard | `/admin/dashboard` | 1 |
| RBAC | `/admin/rbac/*` | 8 |
| Users & Consumers | `/admin/users*`, `/admin/consumers*` | 5 |
| Partners & KYC | `/admin/partners/*` | 9 |
| Bookings | `/admin/bookings/*` | 4 |
| Catalog | `/admin/catalog/*` | 22 |
| Coupons | `/admin/coupons/*` | 5 |
| Settlements | `/admin/settlements/*` | 4 |
| Support tickets | `/admin/support-tickets/*` | 7 |
| Training | `/admin/training/*` | 8 |

**Notable design decisions:**

- **RBAC wires up a pre-existing, pre-seeded schema rather than inventing
  one.** `roles`/`permissions`/`role_permissions` were already fully
  populated by another team member; `user_roles` had 0 rows. This stage adds
  `require_permission()` as a second, granular gate on top of the existing
  coarse `role: admin` JWT check — it doesn't replace it.
- **Refund approval, manual dispatch override, and notification management
  are not duplicated** — they already existed (Stages 1/3/4) under admin
  gating; this stage only added `admin_actions` logging to them.
- **"Package CRUD" maps to `subscriptions`**, the closest live-schema analog
  to a purchasable "package" — see `docs/ADMIN_BACKEND.md` for why there's no
  dedicated packages table and what's exposed instead.
- **Soft-delete throughout**: every catalog/coupon "delete" endpoint sets
  `is_active=false` rather than issuing a `DELETE`, since these rows are
  referenced by historical bookings/payments.

## Analytics (`/api/v1/admin/analytics/*`) — 11 endpoints, Stage 7

`revenue`, `bookings`, `partners`, `consumers`, `trends`, `conversion`,
`cancellations`, `dispatch` (alias for the existing `/dispatch/analytics`),
`payments`, `notifications`, `support`. All gated by `reports.read`. Full
detail in `docs/ANALYTICS.md`.
