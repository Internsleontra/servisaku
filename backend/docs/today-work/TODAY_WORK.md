# Today's Work — 10–11 July 2026

## Summary

Five backend stages were completed against the live shared AWS RDS database
(`servisakudb`, via SSH tunnel): **Payment Gateway** (Stage 1), **Media
Uploads** (Stage 2), **Notification Dispatcher** (Stage 3), **Smart
Dispatch** (Stage 4), and **Real-Time Communication** (Stage 5) — plus a
mid-session repository migration once it was clarified that the intended
home for this backend was `servisaku-partner-consumer/backend/`, not the
standalone `servisaku-mobile-Partner` repo it had been built in. All stages
were preceded by real discoveries about the live database that changed the
implementation approach mid-stream — documented in detail below and in
`DATABASE_CHANGES.md`.

## Timeline

1. **Model reconciliation carried over from the prior session** — a
   `Partner` row could not be created against `servisakudb` at all before
   this fix (identity split between this app's private `auth_users` and the
   shared `users` table). Fixed and committed (`609a825`) before this
   session's Payment Gateway work began.

2. **Payment Gateway, first attempt (Stripe, job-centric)** — built against
   the master prompt's literal instructions. While booting the app,
   `Base.metadata.create_all()` revealed that `payments`/`refunds` tables
   **already existed** in the shared database, built by another team member:
   keyed on `booking_id`/`consumer_id` (not this app's `jobs`/`customers`),
   using `IPAY88`/`BILLPLZ` gateway enums (not Stripe), with escrow modeled
   as payment status values. Both tables had 0 rows — no data was at risk —
   but the Stripe-based code would have failed on first write. Discarded and
   rebuilt.

3. **Payment Gateway, rebuilt against the real schema** — required standing
   up minimal booking-chain scaffolding first (0 bookings existed anywhere):
   read models for the existing service catalog, a writable consumer address
   model, a `Booking` model, and a minimal consumer-facing route group. Then
   Billplz (self-serve free sandbox) and a stubbed iPay88 (no self-serve
   sandbox exists) were implemented against the real `payments`/`refunds`
   tables. Committed as `6b2b4aa`.

4. **Approved by the user**, who asked for: full documentation pass,
   Swagger/OpenAPI examples on every endpoint, and a provider-agnostic
   gateway architecture so future gateways don't require business-logic
   changes. Delivered: `services/gateway_base.py` (interface) +
   `services/gateway_registry.py`, request/response examples on every
   payment/consumer schema, `docs/BILLPLZ_SETUP.md`, and targeted fixes to
   five other repo docs that had stale payment claims (iPay88-only plans,
   24h auto-escrow, Stripe roadmap mentions). Committed as `4817420`.

5. **Stage 2 — Cloudinary media uploads.** Avatar (partner + consumer), KYC
   documents, and job photos (before/after), reusing existing DB fields
   exactly as they were — no schema changes. Both a server-side validated
   upload path and a signed direct-to-Cloudinary path were implemented,
   since the task explicitly asked for both. Real magic-byte MIME sniffing
   (not just trusting the declared Content-Type), size limits, and automatic
   image optimization. Also fixed a pre-existing duplicate router
   registration bug found while touching `main.py`. Committed as `de8243a`.

6. **Merged and pushed.** The remote had diverged (a July 2 commit deleted
   `backend/.env.example`, while today's four commits actively extend that
   same file) — resolved by keeping the file, since it's the active template
   for Billplz/iPay88/Cloudinary config this session added, per your own
   explicit instructions this session to keep it updated. Flagged in case
   that deletion was actually intentional. Merged (`fa9b57e`) and pushed to
   `origin/main`.

7. **Pre-Stage-3 verification checklist** (your explicit ask before starting
   Stage 3): confirmed zero untracked/stray implementation files anywhere,
   local `main` exactly matched `origin/main`, discarded a trivial pre-existing
   whitespace-only diff in `backend/schemas/feedback.py` unrelated to any of
   this work, reinstalled from `requirements.txt` to confirm it reproduces the
   environment, and did a full boot + Swagger/ReDoc verification against the
   live database.

8. **Stage 3 — Notification Dispatcher.** Before writing any code, re-checked
   the live schema (per the established pattern) and found it had grown
   substantially since Stage 1/2 with entirely new tables from other team
   members' concurrent work (`device_tokens`, `notification_logs`,
   `notification_preferences`, plus unrelated `payment_transactions`,
   `escrow_transactions`, and several `*_legacy_stub` tables). Confirmed
   nothing already built (`payments`, `refunds`, `bookings`, `reviews`,
   `notifications`) had drifted, then built the dispatcher directly against
   the three new, empty, purpose-built tables: Firebase push (Spark/free
   plan), email via Resend→Brevo→MailerSend fallback, and a mock SMS
   provider, all behind provider interfaces mirroring the Payment Gateway's
   architecture. Wired into registration, booking creation, payment
   confirmation, and feedback submission. Found and fixed two real bugs
   during verification (a foreign-key race with `BackgroundTasks`, and an
   unconfigured-provider exception that could have broken payment
   confirmation) — see `DATABASE_CHANGES.md` and `TEST_REPORT.md`. Committed
   as `9572c0e`.

9. **Repository migration.** Backend work had been built in a standalone
   `servisaku-mobile-Partner` repo — it turned out the intended home was
   `servisaku-partner-consumer/backend/` (the actual product repo, sharing
   the same `servisakudb`). Investigated both repos' `PROJECT_HANDOFF.md`/git
   history to confirm this rather than guess, then migrated using
   `git filter-repo` (scoped to `backend/` plus the relevant docs, renamed
   under `backend/docs/`) followed by `git subtree add` — preserving full
   per-commit history for both the 06-28 scaffold and every stage since,
   while leaving `servisaku-partner-consumer`'s existing 40 commits,
   frontend, and Express/Prisma backend completely untouched (verified:
   every changed file was a plain `A`dd, zero `M`/`D` outside `backend/` and
   one approved `.gitignore` hardening edit). One recovery was needed
   mid-migration after a wrong `git reset --hard` target was used to undo a
   nesting bug — caught immediately, fully recovered via `git reflog` before
   any push happened, nothing lost. Two commits landed:
   `chore(backend): import FastAPI backend...` and
   `chore: gitignore Python build artifacts for backend/`.

10. **Stage 4 — Smart Dispatch.** Re-checked the live schema fresh in the new
    repo location before writing code and found it unchanged (still 83
    tables) — confirmed `job_dispatches`, `blocked_matches`, and
    `partner_service_categories` were pre-built, empty tables purpose-made
    for this stage. Built the nearby-partner search (raw PostGIS SQL),
    scoring (proximity/rating/completion/language/workload), the sequential
    offer queue with expiration/retry, manual override, dispatch analytics,
    and a background `asyncio` sweep worker. Seeded real geo/skill/language
    test data (including a second test partner) to make ranking and retry
    genuinely testable. See `docs/SMART_DISPATCH.md` for full design and
    verification detail, including two real bugs found and fixed.

11. **Stage 5 — Real-Time Communication.** Added a JWT-authenticated,
    room-based Socket.IO layer (`services/realtime/`) over the existing
    FastAPI app via a decoupled event bus, so Smart Dispatch and Chat push
    live updates instead of requiring polling. Implemented booking-room
    permission checks, live chat (both a Socket.IO-native path and a REST
    fallback), typing indicators, read receipts, partner location broadcast,
    presence, and heartbeat. Verified live with real concurrent
    `socketio.AsyncClient` connections. See `docs/SOCKET_ARCHITECTURE.md`
    for full design and verification detail.

## What's genuinely done vs. pending real credentials

All three stages are **fully implemented and verified against the live
database** end-to-end — every DB write, authorization boundary, validation
rule, and error path was exercised with real HTTP calls. What's **not yet
verified** is the literal outbound call to each third-party API, because no
real credentials exist yet for any of them:

- **Billplz**: sandbox account is free and self-serve — you said you'd
  create it separately. See `docs/BILLPLZ_SETUP.md`.
- **Cloudinary**: free tier, self-serve at
  `https://cloudinary.com/users/register/free` using `intern@leontra.com`.
  Nobody has signed up yet.
- **iPay88**: stubbed on purpose — no self-serve sandbox exists; requires
  emailing `support@ipay88.com.my` for a manually-approved merchant account.
- **Firebase**: free (Spark plan) project at
  `https://console.firebase.google.com` using `intern@leontra.com`. Nobody
  has signed up yet.
- **Resend / Brevo / MailerSend**: all free-tier, self-serve. Nobody has
  signed up for any of them yet — the dispatcher tries whichever ones have
  an API key configured, in that preference order.

Once real keys land in `.env`, the only thing that could still need
adjustment is the Billplz X-Signature verification algorithm (implemented
per their documentation but never checked against a real callback) — the
Cloudinary signed-upload signature and the Firebase/email integrations have
no equivalent risk since they all call each vendor's own SDK/well-documented
REST contract rather than a hand-written reimplementation of a signing
scheme.

Stages 4 and 5 need **no new third-party credentials** — Smart Dispatch and
Socket.IO are entirely self-contained (PostGIS + the existing DB, no
external services), so both are fully live-verified end-to-end with nothing
pending.

## Follow-up worth tracking (not fixed here, out of scope for Stage 4/5)

While verifying Stage 4/5, live testing surfaced a **significant, pre-
existing, codebase-wide bug**: `asyncpg` silently interprets a naive Python
`datetime` (from the now-deprecated `datetime.utcnow()`, used throughout
every earlier stage) as being in the *local system's* timezone — not UTC —
when writing it to a `timestamptz` column, even though the DB session's own
`TimeZone` is UTC. On a server whose local timezone isn't UTC (like this dev
machine, IST/+5:30), every such timestamp across the whole app (payments,
auth, uploads, notifications) is silently stored offset from true UTC. Fixed
throughout this stage's own new code (using `datetime.now(timezone.utc)`
everywhere instead); recommend a dedicated follow-up pass across the earlier
stages' code once a suitable low-risk window exists, since none of those
call sites were touched here per the "don't modify what isn't in scope"
instruction. See `docs/SMART_DISPATCH.md` for the full discovery story.

See `TEST_REPORT.md` for the full verification breakdown.

## Stage 6 — Admin Backend

Preflight redone from scratch per instruction: pulled latest, verified boot,
re-queried the live schema (still 83 tables, unchanged since Stage 4/5). That
re-query surfaced 17 more pre-existing, previously-empty-or-unwired tables
this stage needed — most notably a **complete, pre-seeded RBAC schema**
(`roles`/`permissions`/`role_permissions`, 43 mappings) that no code had ever
read from, and `user_roles` sitting at 0 rows. Wiring that up — rather than
building a parallel RBAC system from scratch — was the core of this stage.
73 new endpoints across 10 route groups (dashboard, RBAC, users/consumers,
partners+KYC, bookings, catalog, coupons, settlements, support tickets,
training). Full detail in `docs/ADMIN_BACKEND.md`.

Two real bugs found and fixed during live verification: `audit_logs` has a
Postgres `GENERATED ALWAYS` column that the initial model mapped as a normal
writable field (Postgres rejects any explicit value for such a column,
including NULL); and three catalog/coupon create endpoints let a duplicate-
key `IntegrityError` bubble to a raw 500 instead of a clean 409. Both fixed;
see `docs/ADMIN_BACKEND.md` for the full story.

No new third-party credentials needed — Stage 6 is entirely self-contained
against the existing database, same as Stage 4/5.

## Stage 7 — Analytics

11 read-only endpoints under `/admin/analytics/*` (revenue, bookings,
partner performance, consumers, trend metrics, conversion funnel,
cancellations, dispatch — aliased to the existing Stage 4 endpoint, not
duplicated — payments, notifications, support), all gated by `reports.read`
(the Stage 6 RBAC layer). Checked `information_schema.views`/`pg_matviews`
first per the "reuse existing database views where possible" instruction —
none exist beyond PostGIS's own, so everything is computed live from
existing tables. Full detail in `docs/ANALYTICS.md`.

Live-verified against real data: revenue analytics correctly totals the
RM1,350 across 9 captured payments from prior stages' live testing;
conversion analytics correctly reflects the 15 test bookings' funnel
(11 confirmed, 5 partner-assigned, 1 completed). No new bugs found — this
stage's endpoints are all read-only aggregate queries, a smaller surface
area than Stage 6's mutations.

An SSH tunnel drop (to the AWS RDS bastion) was hit and fixed mid-stage —
noted here since it's an infrastructure hiccup, not an app bug: the tunnel
had been idle since the previous session and dropped; reconnected with the
same `ssh -L 15433:...` command from the original setup before continuing.

## Stage 8 — Testing & Quality Assurance

Built a real pytest suite from scratch (none existed before this stage) —
unit, API, integration, and Socket.IO tests spanning every module across
Stages 1-7. Runs in-process against `main.app` via httpx's `ASGITransport`
and the real dev database (no separate test/staging DB is provisioned for
this project — a deliberate, documented tradeoff, see
`docs/TESTING_GUIDE.md`). 200+ tests, 0 failures on the final run.

Several genuine test bugs were found and fixed during development (wrong
endpoint paths, wrong request-body shapes, a Decimal-serializes-as-JSON-
string gotcha) — none were application bugs; each is called out in
`docs/today-work/TEST_REPORT.md` to distinguish "the test was wrong" from
"the app was wrong." Zero real application bugs were found this stage —
expected, since Stage 8 tests the already-thoroughly-live-verified surface
from Stages 1-7 rather than new business logic.

Full regression pass repeated the same manual endpoint sweep used at the
end of every prior stage: all Stage 1-7 endpoints still return correct
status codes. See `docs/today-work/TEST_REPORT.md` for exact numbers and
coverage.
