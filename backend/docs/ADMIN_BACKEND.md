# Admin Backend (Stage 6)

Secure admin APIs for platform operations: dashboard, user/partner/consumer
management, partner approval + KYC review, booking oversight, catalog CRUD,
coupons, settlements, support tickets, training content, and role-based
access control (RBAC). All endpoints live under `/api/v1/admin/*`.

## Preflight (done before writing any code)

Pulled latest, verified the backend booted, and re-queried the live schema
from scratch (same discipline as every prior stage). Still 83 tables,
unchanged since Stage 4/5. This re-query is what surfaced the tables this
stage needed: `roles`, `permissions`, `role_permissions`, `user_roles`,
`admin_actions`, `audit_logs`, `coupons`, `coupon_service_categories`,
`ops_tickets`, `ops_ticket_evidence`, `service_addons`, `pricing_rules`,
`surge_pricing_rules`, `training_modules`, `training_questions`,
`partner_training_progress`, `subscriptions` — all pre-existing, all owned by
other team members' modules, all empty or (for RBAC) pre-seeded with
reference data but never wired to any code.

## RBAC: wiring up pre-existing, pre-seeded tables

The single most significant discovery this stage: `roles` (7 rows —
SUPER_ADMIN, OPS_MANAGER, FINANCE, SUPPORT_AGENT, READ_ONLY, PARTNER,
CONSUMER), `permissions` (20 rows, e.g. `partners.approve`, `coupons.manage`,
`payments.refund`), and `role_permissions` (43 mappings) were already fully
populated by another team member — but `user_roles` had **0 rows**. No user,
including the seed admin account, had ever been assigned a granular role.
Every prior stage's admin gating (`auth.get_current_admin_id`) only checked
the coarse JWT `role: "admin"` claim.

`services/rbac.py` adds a second, granular layer on top of that coarse gate:
`get_user_permissions()` joins `user_roles -> roles -> role_permissions ->
permissions` for the effective permission set, and `require_permission(name)`
is a dependency factory that 403s unless the caller has that permission (or
the wildcard `admin.full_access`, which only `SUPER_ADMIN` carries). Every
new admin endpoint that has a clean match in the seeded `permissions` table
uses this; `admin/rbac/*` endpoints let admins list roles/permissions and
assign/revoke roles.

`seed.py` now assigns `SUPER_ADMIN` to the seed admin account
(`admin@servisaku.com`) — without this, every `require_permission()` check
would 403 even for the account that's supposed to have full access, since
`user_roles` started this stage completely empty.

**Live-verified**: a partner JWT gets 403 on every `/admin/*` endpoint. A
second test admin assigned only `READ_ONLY` (which, per the pre-seeded data,
maps to **zero** permissions in `role_permissions` — an incompleteness in
the data this stage inherited, not introduced) correctly gets 403 everywhere,
demonstrating the gate fails closed rather than open. `SUPER_ADMIN` succeeds
everywhere.

**Endpoints with no clean permission match** (training module/question CRUD
— nothing in the seeded 20 permissions maps to training content) are gated
at the coarse `role: admin` level only, same as every pre-Stage-6 admin
endpoint, rather than inventing a permission name that doesn't exist in the
live `permissions` table.

## "Package CRUD" — a design decision, not a missing feature

The live schema has no dedicated "packages" catalog table. The closest real
analog is `subscriptions` — a consumer's membership plan, a **fixed 3-value
enum** (`PLUS_MONTHLY`, `PLUS_ANNUAL`, `B2B`), not an admin-creatable row
type. `GET/PUT /admin/catalog/packages*` exposes list/view/status-change
(cancel/reactivate) over individual subscription instances — there's nothing
to "create" beyond a new subscription for a user, since the plan tiers
themselves aren't rows. See `models/subscription.py` for the full note.
"Questions CRUD" is `training_questions` (quiz questions for partner
training modules) — the only admin-manageable question bank that exists in
the live schema.

## Reused, not duplicated

Three items on the Stage 6 task list already existed from earlier stages
under coarse admin gating and were **not duplicated** here, to avoid two
code paths mutating the same rows:

- **Refund Approval** — `POST /payments/refunds/{id}/approve|reject|complete` (Stage 1)
- **Manual Dispatch Override** — `POST /dispatch/bookings/{id}/override` (Stage 4)
- **Notification Management** — `POST /notifications/topics/{topic}/send`, `/notifications/logs/{id}/retry`, `/notifications/retry-failed` (Stage 3)

All three now also write to `admin_actions` (see below) — the only change
made to them this stage.

## Audit trail: two tables, two granularities

- **`admin_actions`** (`services/rbac.py::log_admin_action`) — one line per
  admin mutation: who, what action, what target. Written by every mutating
  endpoint added this stage, plus retrofitted onto the three reused
  endpoints above.
- **`audit_logs`** (`services/rbac.py::write_audit_log`) — structured
  before/after JSON values, used for the most sensitive state transitions
  (partner approve/reject/suspend, KYC document verify/reject, user status
  change, catalog/coupon/pricing edits).

Both are best-effort (wrapped in try/except, never raise) so a logging
failure can never break the mutation it's describing — the same defensive
pattern Stage 3's notification dispatcher established.

`GET /admin/rbac/actions` and `GET /admin/rbac/audit-logs` are the viewers,
both gated behind `reports.read`.

## Bugs found during live verification

1. **`audit_logs.retention_until` is a Postgres `GENERATED ALWAYS` column**
   (`(created_at AT TIME ZONE 'UTC')::date + '7 years'::interval`, `STORED`).
   The initial model mapped it as a normal nullable `Date` column; Postgres
   rejects *any* explicit value — including `NULL` — in the INSERT column
   list for a `GENERATED ALWAYS` column, so every `write_audit_log()` call
   raised `asyncpg.exceptions.GeneratedAlwaysError`, which then poisoned the
   whole request's session (`PendingRollbackError` on the next flush) and
   surfaced as a 500 on `POST /admin/partners/{id}/approve`. Fixed by
   dropping the column from the ORM mapping entirely (nothing needs to read
   it back either).
2. **Duplicate-key `IntegrityError`s bubbled to raw 500s** instead of clean
   `409`s on `POST /admin/catalog/categories` (unique on `name`/`slug`),
   `POST /admin/catalog/services` (unique on `slug`), and `POST
   /admin/coupons` (unique on `code`). Fixed by catching `IntegrityError`
   around the flush and returning `409 Conflict` with a clear message in all
   three create endpoints.

## Endpoint groups (73 endpoints)

| Group | Prefix | Permission gate |
|---|---|---|
| Dashboard | `/admin/dashboard` | role: admin |
| RBAC | `/admin/rbac/*` | role: admin (+ `admin.full_access` for role assignment, `reports.read` for log viewers) |
| Users & Consumers | `/admin/users*`, `/admin/consumers*` | `users.read` / `users.suspend` |
| Partners & KYC | `/admin/partners/*` | `partners.read` / `partners.approve` / `partners.reject` / `partners.suspend` |
| Bookings | `/admin/bookings/*` | `bookings.read` / `bookings.cancel` |
| Catalog | `/admin/catalog/*` | `pricing.manage` |
| Coupons | `/admin/coupons/*` | `coupons.manage` |
| Settlements | `/admin/settlements/*` | `payouts.process` |
| Support | `/admin/support-tickets/*` | `disputes.manage` |
| Training | `/admin/training/*` | role: admin (no matching permission exists) |

Full request/response schemas and examples are in Swagger UI (`/docs`).

## Verification summary

Live-tested end-to-end against `servisakudb` with a real `SUPER_ADMIN` token
and a real partner token: RBAC enforcement (403 for wrong role, 403 for a
zero-permission role, 200 for `SUPER_ADMIN`), partner approve/reject
lifecycle with a real `SUBMITTED` partner found in the live data, category
-> service -> add-on -> pricing-rule creation chain, coupon creation +
duplicate-code rejection, settlement creation against real `released`
earnings + double-spend rejection, support ticket create -> assign ->
resolve, training module + question creation, booking cancellation with
status-history logging, user suspension, and a full regression pass
confirming every Stage 1-5 endpoint (auth, partner profile, dispatch,
wallet, chat, notifications) still returns `200`.
