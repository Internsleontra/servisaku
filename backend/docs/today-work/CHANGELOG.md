# Changelog — 10–11 July 2026

## Added

### Payment Gateway (Stage 1)
- `models/booking.py`, `models/catalog.py` (`Service`, `ServiceCategory`),
  `models/consumer_address.py`, `models/payment.py` (`Payment`, `Refund`) —
  mapped to the live shared schema.
- `routes/consumer.py` — minimal consumer flow: browse categories/services,
  manage saved addresses, create/list bookings.
- `routes/payments.py` — bill creation, Billplz callback, transaction
  history, payment sync/release, refund request/approve/reject/complete.
- `services/gateway_base.py`, `services/gateway_registry.py`,
  `services/billplz_gateway.py`, `services/ipay88_gateway.py` — provider-
  agnostic payment gateway interface.
- `auth.py`: `get_current_consumer_id` (auto-provisions a `consumer_profiles`
  row on first use), `get_current_admin_id`.
- `docs/BILLPLZ_SETUP.md` — sandbox signup walkthrough.
- Config: `BILLPLZ_*`, `IPAY88_*`, `APP_PUBLIC_BASE_URL`, `PAYMENT_CURRENCY`.

### Media Uploads (Stage 2)
- `services/cloudinary_service.py` — validated server-side upload, signed
  direct-upload params, delete, magic-byte MIME sniffing.
- `routes/uploads.py` — avatar (partner/consumer), KYC documents, job
  photos (before/after), signed-upload + confirm flow.
- `schemas/upload.py`.
- Config: `CLOUDINARY_*`, `MAX_UPLOAD_SIZE_MB`.

### Notification Dispatcher (Stage 3)
- `models/notification_delivery.py` (`DeviceToken`, `NotificationLog`,
  `NotificationPreference`) — mapped to three more pre-existing, previously
  empty shared tables.
- `services/notifications/` package: `push_base.py`/`firebase_push.py`
  (FCM), `email_base.py` + `resend_email.py`/`brevo_email.py`/
  `mailersend_email.py` (fallback chain), `sms_base.py`/`mock_sms.py`,
  `registry.py`, `dispatcher.py` (central orchestration: in-app row always,
  best-effort delivery per channel, preference checks, logging, retry).
- `routes/notification_dispatch.py` (12 endpoints, under the existing
  `/notifications` prefix) — device tokens, preferences, topics, delivery
  logs, retry.
- `schemas/notification_dispatch.py`.
- Config: `FIREBASE_*`, `RESEND_API_KEY`, `BREVO_API_KEY`,
  `MAILERSEND_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`.
- Dispatcher wired into `routes/auth.py` (`verify_otp`), `routes/consumer.py`
  (`create_booking`), `routes/payments.py` (`_mark_payment_paid`,
  `complete_refund`), `routes/feedback.py` (`submit_feedback`).

### Repository migration
- Migrated the entire `backend/` FastAPI app from the standalone
  `servisaku-mobile-Partner` repo into `servisaku-partner-consumer/backend/`
  (the actual product repo) via `git filter-repo` + `git subtree add`,
  preserving full commit history for both the original 06-28 scaffold and
  every stage built since. `backend/docs/` gained `BILLPLZ_SETUP.md`,
  `ServisAku_Partner_API.postman_collection.json`, and `today-work/`
  (this directory) as part of the same migration.

### Smart Dispatch (Stage 4)
- `models/dispatch.py` (`JobDispatch`, `BlockedMatch`,
  `PartnerServiceCategory`) — mapped to three more pre-existing, previously
  empty shared tables.
- `models/booking.py`: added `BookingStatusHistory` (another pre-existing,
  empty table); updated the `Booking` docstring (dispatch is no longer
  "out of scope").
- `models/partner.py`: added `PartnerLanguage`.
- `models/consumer_profile.py`: added `preferred_partner_language`.
- `services/dispatch/` package: `matching.py` (raw-SQL PostGIS proximity
  search + ORM-based availability/skill/blocked/workload filtering +
  scoring), `engine.py` (sequential offer queue: start/accept/decline/
  expire/retry/manual-override), `analytics.py` (aggregate stats),
  `background.py` (periodic `asyncio` expiry-sweep worker).
- `services/realtime/events.py` — lightweight in-process pub/sub so
  dispatch/chat business logic can emit real-time events without importing
  the Socket.IO layer (decoupling point, avoids a circular import).
- `routes/dispatch.py` (11 endpoints, prefix `/dispatch`) — candidate
  preview, start, offer accept/decline, history, manual override, blocked
  matches, analytics, manual sweep trigger, post-assignment status
  progression.
- `schemas/dispatch.py`.
- `seed.py`: `seed_dispatch_geo_and_skills` (partner/consumer-address
  PostGIS coordinates, a skill-match row, partner languages) and
  `seed_second_test_partner` (a second geo-tagged partner, needed to make
  ranking/retry genuinely testable with real data).
- Config: `DISPATCH_OFFER_TIMEOUT_SECONDS`, `DISPATCH_MAX_CANDIDATES`,
  `DISPATCH_MAX_ATTEMPTS`, `DISPATCH_SEARCH_RADIUS_KM_CAP`,
  `DISPATCH_SWEEP_INTERVAL_SECONDS`.
- Auto-triggered from `routes/payments.py::_mark_payment_paid` the moment a
  booking becomes `CONFIRMED` with no partner assigned.
- `docs/SMART_DISPATCH.md`.

### Real-Time Communication (Stage 5)
- `services/realtime/socket_server.py` — JWT-authenticated Socket.IO
  server: room management (`user:`/`consumer:`/`partner:`/`booking:`),
  chat send/typing/read, partner location broadcast, presence, heartbeat,
  and the business-event bridge that maps dispatch/booking/chat events onto
  room broadcasts.
- `models/chat.py` (`ChatThread`, `ChatMessage`) — mapped to two more
  pre-existing, previously empty shared tables.
- `routes/chat.py` (4 endpoints, prefix `/chat`) — REST fallback for thread
  listing, message history, send, and mark-read (Socket.IO is the primary
  path for the latter two).
- `schemas/chat.py`.
- `main.py`: `socket_app = socketio.ASGIApp(sio, other_asgi_app=app)` — the
  new entrypoint to run (`uvicorn main:socket_app`); `app` itself is
  unchanged and still usable directly. Background dispatch-sweep task
  started/cancelled in the lifespan.
- `/health` now also reports `realtime.connected_sessions`.
- Config: none new — Socket.IO reuses `ALLOWED_ORIGINS`.
- `docs/SOCKET_ARCHITECTURE.md`.

## Changed

- `routes/jobs.py`: ended the session unchanged from its prior-session state
  — an experimental Stripe-era escrow tweak was tried and then reverted when
  that whole approach was discarded (see `GIT_COMMITS.md`).
- `models/consumer_profile.py`: now writable (was read-only), gained
  `created_at`/`updated_at`.
- `main.py`: registered `consumer_router`, `payments_router`,
  `uploads_router`; added their Swagger tag descriptions.
- `seed.py`: added consumer profile/address, one sample service, one sample
  `PENDING_PAYMENT` booking for end-to-end testing.
- `backend/API_TESTING_REPORT.md`: added Consumer (6), Payments (11), and
  Uploads (10) endpoint sections.
- `README.md`, `SERVICE_PARTNER_MODULE_DOCUMENTATION.md`, `SYSTEM_DESIGN.md`,
  `PRODUCT_KNOWLEDGE.md`: corrected stale payment/escrow/file-upload claims
  with targeted fixes and dated addendum notes (not full rewrites — these
  documents are largely authored by other team members).

## Fixed

- `main.py`: `payments_router` was registered twice via
  `app.include_router` (duplicated every payment route in the OpenAPI
  schema — harmless but sloppy; found while wiring in `uploads_router`).
- `routes/consumer.py`: booking-creation notifications were dispatched via
  `BackgroundTasks` referencing the just-created `booking_id`, which has a
  live FK constraint — the background task's independent DB session raced
  against the triggering request's transaction and hit a
  `ForeignKeyViolationError`. Fixed by dispatching inline (same session,
  already flushed) for this specific call site.
- `services/notifications/dispatcher.py`,
  `services/notifications/firebase_push.py`: an unconfigured/failing
  notification channel could raise out of `dispatch()` and break whatever
  business action triggered it (e.g. a payment webhook). Hardened at both
  the dispatcher level (each channel attempt isolated) and the provider
  level (`FirebasePushProvider` returns a failed `PushResult` instead of
  raising for "not configured").
- Discarded a trivial, pre-existing whitespace-only diff in
  `backend/schemas/feedback.py` (unrelated to any of this session's work)
  to leave a clean working tree per the pre-Stage-3 verification ask.
- `routes/dispatch.py`: `accept_dispatch_offer` compared a tz-aware DB
  datetime directly against the naive `datetime.utcnow()`, raising
  `TypeError: can't compare offset-naive and offset-aware datetimes` on
  every accept attempt. Fixed by using `datetime.now(timezone.utc)`.
- `services/dispatch/engine.py`, `routes/dispatch.py`, `routes/chat.py`,
  `services/realtime/socket_server.py`: every `datetime.utcnow()` call
  writing to or comparing against a `DateTime(timezone=True)` column
  replaced with `datetime.now(timezone.utc)`, after live testing uncovered
  that `asyncpg` silently shifts naive datetimes by the local system's UTC
  offset when binding them to `timestamptz` columns — see
  `docs/SMART_DISPATCH.md` for the full discovery.
- `services/realtime/events.py`: a debug logging line (added, then fixed,
  during the investigation above) used a kwarg literally named `event=`,
  which collides with `structlog`'s own positional event-name parameter —
  renamed to `event_name` (this pattern also existed latently in the
  original error-logging call, fixed at the same time, before it could ever
  mask a real subscriber exception).
- `routes/dispatch.py`: `override_dispatch` (manual override) had no
  `booking_status` validation at all — an admin could target a
  `PENDING_PAYMENT`, `COMPLETED`, or `CANCELLED` booking. Added a guard
  restricting it to `CONFIRMED`/`PARTNER_ASSIGNED`.

## Removed

- `services/billplz_service.py`, `services/ipay88_service.py` — replaced by
  the provider-agnostic `*_gateway.py` equivalents.

### Admin Backend (Stage 6)

#### Added

- `models/rbac.py` (`Role`, `Permission`, `RolePermission`, `UserRole`) —
  mapped to the shared, pre-seeded RBAC tables (7 roles, 20 permissions, 43
  mappings) that no prior stage had ever queried.
- `models/admin_log.py` (`AdminAction`, `AuditLog`) — two more pre-existing,
  empty tables, now the admin action/audit trail.
- `models/coupon.py` (`Coupon`, `CouponServiceCategory`), `models/support_ticket.py`
  (`OpsTicket`, `OpsTicketEvidence`), `models/training.py` (`TrainingModule`,
  `TrainingQuestion`, `PartnerTrainingProgress`), `models/subscription.py`
  (`Subscription`) — all pre-existing, previously-empty shared tables.
- `models/catalog.py`: added `ServiceAddon`, `PricingRule`,
  `SurgePricingRule`; extended `ServiceCategory`/`Service` from their
  Stage-1 read-mostly minimal mapping to their full live column set (now
  that full catalog CRUD is in scope).
- `services/rbac.py` — `get_user_permissions`/`get_user_roles`,
  `require_permission()` dependency factory, `log_admin_action`/
  `write_audit_log` (both best-effort, never raise).
- `routes/admin_dashboard.py`, `routes/admin_rbac.py`, `routes/admin_users.py`,
  `routes/admin_partners.py`, `routes/admin_bookings.py`,
  `routes/admin_catalog.py`, `routes/admin_coupons.py`,
  `routes/admin_settlements.py`, `routes/admin_support.py`,
  `routes/admin_training.py` — 73 endpoints total.
- `schemas/admin.py`, `schemas/catalog_admin.py`, `schemas/coupon.py`,
  `schemas/support.py`, `schemas/training.py`.
- `seed.py`: `seed_admin_rbac` — assigns `SUPER_ADMIN` to the seed admin
  account (`user_roles` had 0 rows before this; without it, every
  `require_permission()` check would 403 even for the intended super-admin).
- `docs/ADMIN_BACKEND.md`.

#### Changed

- `routes/payments.py` (`approve_refund`/`reject_refund`/`complete_refund`),
  `routes/dispatch.py` (`override_dispatch`), `routes/notification_dispatch.py`
  (`send_to_topic`/`retry_notification_log`/`retry_failed_notifications`):
  added `log_admin_action` calls — the only change to these Stage 1/3/4
  endpoints, so the admin action log covers every admin mutation in the app,
  not just the ones added this stage. Behavior otherwise unchanged.

#### Fixed

- `models/admin_log.py`: `audit_logs.retention_until` is a Postgres
  `GENERATED ALWAYS AS (...) STORED` column; the initial mapping declared it
  as a normal writable `Date`, and Postgres rejects any explicit value
  (including NULL) in the INSERT column list for such a column — every
  `write_audit_log()` call raised `GeneratedAlwaysError`, surfacing as a 500
  on `POST /admin/partners/{id}/approve`. Fixed by dropping the column from
  the mapping entirely.
- `routes/admin_catalog.py` (`create_category`, `create_service`),
  `routes/admin_coupons.py` (`create_coupon`): a duplicate `name`/`slug`/
  `code` raised a raw `IntegrityError` that bubbled to an unhandled 500.
  Fixed by catching it around the flush and returning a clean `409`.
