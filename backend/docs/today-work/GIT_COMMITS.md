# Git Commits — 10–11 July 2026

All commits below are on `main`, pushed to
`https://github.com/Dineshkuppuraj17/servisaku-partner-consumer`.

**Note on hashes**: Stages 1–3 were originally committed in a standalone
repo (`servisaku-mobile-Partner`) before the repository migration described
below. `git filter-repo` rewrites commit SHAs when history is filtered, so
the hashes below are this repository's actual hashes for those same
commits — they differ from any hash recorded elsewhere for the same work.

## `77e77fb` — fix: reconcile SQLAlchemy models with the live servisakudb schema

Carried over from the prior session, committed at the start of that
session's work before Payment Gateway work began. Moved identity from this
app's private `auth_users` table to the shared `users` table, and fixed
`Partner`/`PartnerDocument`/`PartnerAvailability`/`Review`/`Notification`
column-level drift against the live database — without this, a `Partner` row
could not be created at all.

## `3bf968b` — feat(payments): Stage 1 - Billplz payment gateway against live booking schema

The Payment Gateway, rebuilt from scratch mid-session after discovering the
live schema didn't match the original Stripe/job-centric plan (see
`DATABASE_CHANGES.md` for the full discovery). Adds: `Booking`, `Payment`,
`Refund`, `Service`, `ServiceCategory`, `ConsumerAddress` models; a minimal
consumer booking flow; Billplz integration (real, self-serve sandbox) and an
iPay88 stub (no self-serve sandbox exists); the escrow/refund-approval
workflow against `payments.status`/`refunds.status`.

## `ac40656` — refactor(payments): provider-agnostic gateway interface + docs hardening

Requested by the user after approving Stage 1: refactored direct
`billplz_service` calls into a `PaymentGateway` abstract interface +
registry so gateway selection never requires route/business-logic changes;
verified by exercising both `BILLPLZ` and `IPAY88` through the same code
path. Added Swagger request/response examples to every payment/consumer
schema and endpoint. Added `docs/BILLPLZ_SETUP.md`. Fixed stale
payment/escrow claims in `README.md`, `SERVICE_PARTNER_MODULE_DOCUMENTATION.md`,
`SYSTEM_DESIGN.md`, `PRODUCT_KNOWLEDGE.md`.

## `4d0401d` — feat(uploads): Stage 2 - Cloudinary media uploads (avatar, KYC, job photos)

Avatar, KYC document, and job/booking photo uploads via Cloudinary's free
tier, reusing existing DB fields with zero schema changes. Both a validated
server-side upload path and a signed direct-to-Cloudinary path, per the task
list. Real magic-byte MIME sniffing, size limits, automatic image
optimization. Also fixed a pre-existing duplicate `payments_router`
registration in `main.py` found while wiring in the new router.

## `9f20ae5` — Merge branch 'main' of github.com:Dineshkuppuraj17/servisaku-mobile-Partner

Reconciles a diverged remote (in the original `servisaku-mobile-Partner`
repo, before migration): `origin/main` had gained one commit
(`2b50699`, 2 July 2026, "Delete backend/.env.example", authored by
Animesh) that this session's local history didn't have. Resolved a
modify/delete conflict on `backend/.env.example` by keeping it — Stage 1 and
Stage 2 work both actively depend on it as the template for
`BILLPLZ_*`/`IPAY88_*`/`CLOUDINARY_*` config.

## `9c68b41` — docs: add today-work summary for Payment Gateway + Media Uploads stages

The first version of these six `docs/today-work/` files, covering Stages 1–2.

## `0444cf4` — feat(notifications): Stage 3 - Notification Dispatcher (FCM push, email, mock SMS)

Notification Dispatcher against three more pre-existing, previously-empty
shared tables discovered this session (`device_tokens`, `notification_logs`,
`notification_preferences`). Provider-agnostic architecture mirroring the
Payment Gateway's approach: Firebase push, Resend→Brevo→MailerSend email
fallback chain, mock SMS, all behind interfaces. Central `dispatcher.py`
orchestrates in-app notification creation, per-channel best-effort delivery,
preference checks, and logging. New `routes/notification_dispatch.py` (12
endpoints) for device tokens, preferences, topics, delivery logs, and retry.
Wired into registration, booking creation, payment confirmation, and
feedback submission.

Found and fixed two real bugs during verification: (1) a foreign-key race
where booking-creation notifications dispatched via `BackgroundTasks` hit
`notifications_booking_id_fkey` because the background task's independent
session didn't reliably see the same-request booking row — fixed by
dispatching inline for that call site; (2) an unconfigured push provider
could raise out of the dispatcher and break the business action that
triggered it (e.g. a payment webhook) — fixed by making channel dispatch
failures always logged rather than raised, at both the dispatcher and
provider level.

## `0a9d24e` — docs: update today-work summary with Stage 3 (Notification Dispatcher)

Extended the six `docs/today-work/` files with Stage 3 content.

## `ceaf472` — chore(backend): import FastAPI backend (Payment Gateway, Media Uploads, Notification Dispatcher — 10-11 Jul 2026 sessions)

The repository migration. It was clarified mid-session that this backend's
intended home was `servisaku-partner-consumer/backend/` (the actual product
repo, sharing the same `servisakudb`), not the standalone
`servisaku-mobile-Partner` repo it had been built in. Investigated both
repos' `PROJECT_HANDOFF.md`/git history to confirm this rather than guess.
Migrated using `git filter-repo` (scoped to `backend/`, plus
`docs/BILLPLZ_SETUP.md`, `docs/today-work/`, and the Postman collection,
renamed under `backend/docs/`) followed by `git subtree add` — a merge
commit with two parents: `servisaku-partner-consumer`'s own pre-existing
history (untouched) and the filtered backend history (20 commits,
06-28 scaffold through Stage 3). Verified: every file this commit touched
was a plain `A`dd, zero `M`/`D` outside `backend/`.

*(One recovery was needed mid-migration: a wrong `git reset --hard` target
was used while undoing an unrelated nesting bug in an earlier migration
attempt, briefly pointing `main` at the wrong ancestry. Caught immediately,
verified via `git reflog`, and fully restored to the correct base before
this commit was made or anything was pushed — nothing was lost, and nothing
bad ever reached `origin`.)*

## `841b660` — chore: gitignore Python build artifacts for backend/

One small, explicitly-approved addition to `.gitignore`
(`__pycache__/`, `*.pyc`, `.pytest_cache/`, `.venv/`) — found missing during
the pre-push verification checklist for the migration above.

## `4e05149` — feat(dispatch,realtime): Stage 4 Smart Dispatch + Stage 5 Real-Time Communication

Smart Dispatch (nearby-partner search, scoring, sequential offer queue with
expiration/retry, manual override, analytics, background sweep worker) and
Real-Time Communication (JWT-authenticated Socket.IO layer, live chat,
presence, typing, read receipts, location broadcast, heartbeat), built and
verified together per the combined instruction. Two real bugs found and
fixed during live verification: an asyncpg naive-datetime timezone bug
(codebase-wide, pre-existing, fixed in this stage's own code) and a
`structlog` logging-call kwarg collision. See `docs/SMART_DISPATCH.md` and
`docs/SOCKET_ARCHITECTURE.md` for full detail.

## `c07698f` — feat(admin): Stage 6 Admin Backend — RBAC, catalog, partner approval, ops

Wires up the shared, pre-seeded `roles`/`permissions`/`role_permissions`
schema (43 mappings) that no prior stage had ever read from — `user_roles`
had 0 rows before this commit. Adds 73 admin endpoints across dashboard,
RBAC management, user/consumer/partner management, partner approval + KYC
review, booking oversight, service catalog CRUD, coupons, settlements,
support tickets, and training content. Reuses the existing refund-approval/
dispatch-override/notification-management endpoints (only change: added
audit-action logging to them) rather than duplicating. Two real bugs found
and fixed during live verification: `audit_logs.retention_until` is a
Postgres `GENERATED ALWAYS` column the initial model wrongly mapped as
writable (caused a 500 via `PendingRollbackError`), and three catalog/coupon
create endpoints let a duplicate-key `IntegrityError` bubble to a raw 500
instead of a clean 409. See `docs/ADMIN_BACKEND.md` for full detail.

## `326d9a2` — docs: record Stage 6 commit hash in GIT_COMMITS.md

## `8e53f32` — feat(analytics): Stage 7 Analytics — 11 read-only reporting endpoints

Revenue, booking, partner performance, consumer, trend, conversion,
cancellation, dispatch (aliased to the existing Stage 4 endpoint), payment,
notification, and support analytics, gated by the Stage 6 `reports.read`
permission. No database changes — confirmed no analytics view exists in the
live schema before writing any code; every endpoint is a live aggregate
query. See `docs/ANALYTICS.md` for full detail.

## `7085a82` — test(qa): Stage 8 Testing & Quality Assurance — pytest suite, 208 tests

A real automated pytest suite (none existed before): unit, API, integration,
and Socket.IO tests spanning every stage's endpoints. Runs in-process
against the real dev database via httpx's `ASGITransport` — no separate
test DB is provisioned, a deliberate documented tradeoff (see
`docs/TESTING_GUIDE.md`). Final run: 208 passed, 0 failed, 74% coverage.
Zero real application bugs found; several test bugs (wrong endpoint paths,
wrong request shapes) found and fixed during development — see
`docs/today-work/TEST_REPORT.md` for the full breakdown.

## `3e36b15` — docs: Stage 9 Documentation & Final Delivery

`README.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`,
`docs/DEPLOYMENT.md`, `docs/ENVIRONMENT_SETUP.md` — none of which existed
for this backend before this commit (the migration was deliberately scoped
to `backend/` only, so the original repo's root-level docs never came
along). `scripts/generate_final_report.py` and its two outputs,
`docs/reports/ServisAku_Backend_Final_Report.{docx,pdf}`, covering all 16
requested report sections from one shared content source. Added
`.gitattributes` after discovering `core.autocrlf` was about to silently
corrupt the committed PDF's line endings — verified both binary files
staged byte-identical to disk before committing.

## `7e6d663` — feat(hardening): Final Hardening Stage — timezone fix, rate limiting, production guards, CI, coverage 74%->82%

Requested after Stages 1-9 were accepted as feature-complete. One combined
commit (72 files) covering: the codebase-wide timezone fix (32 files,
`utils/time.py`'s `utc_now()` replacing every `datetime.utcnow()`/naive
`datetime.now()`); production rate limiting (`services/rate_limit.py`,
`slowapi`) on login/OTP/payment/refund/upload/notification-broadcast/7
admin-sensitive endpoints; startup-time production guards in `config.py`
(refuses to boot with wildcard CORS or the placeholder JWT secret when
`ENVIRONMENT=production`); a real bug fix (`models/payment.py`/
`routes/payments.py` — `refunds.requires_approval` had drifted into a
Postgres `GENERATED ALWAYS` column while the ORM still mapped it as
writable, silently 500ing every refund request); 12 new test files raising
statement coverage from 74% to 82% (208 -> 307 tests); a Socket.IO test
flakiness root-cause fix (`wait_timeout` + poll-based waits, not just
longer sleeps); `.github/workflows/backend-ci.yml`; and two analysis-only
docs (`docs/JOBS_BOOKINGS_RECONCILIATION.md`, `docs/SOCKET_SCALING.md`,
neither backed by any code/schema change). Zero database schema changes,
zero production data deleted — verified via table count (83, unchanged)
and row-count checks before and after. Full detail in
`docs/today-work/TEST_REPORT.md`, `docs/today-work/CHANGELOG.md`, and
`docs/today-work/DATABASE_CHANGES.md`.

---

Pushed to `origin/main`: to be confirmed after this push (see
`TODAY_WORK.md` for the running total).
