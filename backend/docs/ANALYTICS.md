# Analytics (Stage 7)

11 read-only REST endpoints under `/api/v1/admin/analytics/*`, all gated by
`reports.read` (RBAC, Stage 6). All computed live from existing tables — no
materialized view or analytics table exists in the live schema (checked via
`information_schema.views`/`pg_matviews` before writing any code; only
PostGIS's own system views were present).

## Endpoints

| Endpoint | Covers |
|---|---|
| `GET /admin/analytics/revenue` | Captured/refunded/net revenue, by day, by service category |
| `GET /admin/analytics/bookings` | Booking counts by status/day/category, average booking value |
| `GET /admin/analytics/partners` | Top partners by completed jobs/rating/completion rate, platform-wide averages |
| `GET /admin/analytics/consumers` | New-consumer trend, repeat-booking rate, top spenders |
| `GET /admin/analytics/trends` | Time-series companion to `GET /admin/dashboard`'s point-in-time snapshot |
| `GET /admin/analytics/conversion` | Booking funnel: created → confirmed → assigned → completed |
| `GET /admin/analytics/cancellations` | Cancellation/no-show counts and rate |
| `GET /admin/analytics/dispatch` | Alias for the existing `GET /dispatch/analytics` (Stage 4) |
| `GET /admin/analytics/payments` | Payment status/gateway/method breakdown, refund approval rate |
| `GET /admin/analytics/notifications` | Delivery success rate by channel/provider |
| `GET /admin/analytics/support` | Ticket volume by type/priority/status, avg resolution time, SLA breaches |

## Design decisions

- **`/admin/analytics/dispatch` is a thin alias, not a reimplementation** —
  it calls the same `services/dispatch/analytics.py::get_dispatch_analytics`
  that `GET /dispatch/analytics` (Stage 4) already uses, re-exposed under the
  analytics namespace so a dashboard only needs to know one URL prefix.
- **`/admin/analytics/trends` is deliberately distinct from `GET
  /admin/dashboard`** (Stage 6): the dashboard is a point-in-time snapshot
  (current counts); `trends` is per-day time series over a rolling window,
  suitable for a line chart. Both satisfy "Dashboard Metrics" from different
  angles rather than one duplicating the other.
- **`days` query parameter** (default 30, max 365) on the endpoints where a
  time window is meaningful (`revenue`, `bookings`, `consumers`, `trends`);
  omitted on endpoints reporting current totals (`partners`, `conversion`,
  `cancellations`, `payments`, `notifications`, `support`) where the whole
  history is the relevant denominator.
- **`date_trunc('day', ...)` raw SQL** used for the per-day breakdowns —
  simpler and faster than pulling every row into Python to group by date.

## Verification

Live-tested against `servisakudb` with a `SUPER_ADMIN` token: all 11
endpoints return `200` with real, non-empty data computed from the seed +
Stage 4-6 live-test activity (e.g. revenue analytics correctly totals
RM1,350 across 9 captured payments; conversion analytics correctly shows
15 bookings created → 11 reached CONFIRMED → 5 PARTNER_ASSIGNED → 1
COMPLETED). RBAC verified: a partner JWT gets `403`, no token gets `401`.
Full regression pass after wiring: `GET /admin/dashboard`, `GET
/dispatch/analytics`, and `GET /openapi.json` (144 total paths) all still
return `200`.
