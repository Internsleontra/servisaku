# Deployment Guide

## Current status

This backend has been developed and verified against the team's shared AWS
RDS PostgreSQL instance, reached via an SSH tunnel from a local development
machine. **No production deployment target (server, container platform, CI/CD
pipeline) has been set up yet** — this guide describes what deploying it
would involve, based on how it's built.

## Runtime requirements

- Python 3.11+
- Network access to `servisakudb` (either directly, if the deployment
  target is inside the same VPC as the RDS instance, or via a tunnel/bastion
  otherwise)
- Environment variables set (see `.env.example` — `DATABASE_URL` and
  `JWT_SECRET_KEY` are mandatory; everything else is feature-gated and
  fails gracefully if absent)

## Process

The real ASGI entrypoint is `main:socket_app` (not `main:app`) — it wraps
the FastAPI app with the Socket.IO Engine.IO transport. Running `main:app`
directly serves REST fine but silently drops all real-time functionality.

```bash
uvicorn main:socket_app --host 0.0.0.0 --port 8000 --workers 4
```

**Multi-worker caveat**: `services/realtime/events.py` is an in-process
pub/sub bus and `services/realtime/socket_server.py`'s in-memory `_sessions`/
socketio room manager are both process-local — business-logic events
(dispatch offers, chat messages) only reach Socket.IO clients connected to
the *same worker process* that handled the triggering request. Running
multiple uvicorn workers behind a load balancer will cause real-time events
to be missed by clients connected to a different worker. See
`docs/SOCKET_SCALING.md` for the full explanation, the Redis-backed
(`AsyncRedisManager`) fix, and the ordered migration steps — not yet applied
since verification has only ever run a single process.

## Database migrations

Alembic is configured (`alembic.ini`, `migrations/`) but this backend has
not needed to run any migrations of its own — every table it uses was
either pre-existing shared infrastructure or created by another team
member's module. `main.py`'s lifespan calls
`Base.metadata.create_all()` on startup, which is a no-op for tables that
already exist (it only creates genuinely missing tables) — safe in
production, but not a substitute for real migrations if this backend ever
needs to *change* an existing table's shape.

## Background workers

The Smart Dispatch expiry-sweep worker (`services/dispatch/background.py`)
runs as an `asyncio` task inside the same process (started/cancelled in
`main.py`'s lifespan), not a separate worker process — it needs no extra
deployment infrastructure (no Celery/RQ/separate queue), but does mean it
stops if the process stops, same caveat as the Socket.IO multi-worker note
above (each worker process runs its own independent sweep — harmless
duplication, since `run_expiry_sweep`'s queries are idempotent per-row, but
worth knowing).

## Environment variables checklist for production

| Variable | Notes |
|---|---|
| `ENVIRONMENT` | **Must** be `production` — this activates the startup guards below (see `config.py`) |
| `DATABASE_URL` | Point at production DB; use a connection pooler (PgBouncer) if scaling beyond a few workers |
| `JWT_SECRET_KEY` | **Must** be a real random secret, never the `config.py` placeholder default. The app now **refuses to boot** if `ENVIRONMENT=production` and this is still the placeholder — see `docs/SECURITY.md` |
| `ALLOWED_ORIGINS` | **Must** be restricted from the dev default `["*"]` to real client origins. The app now **refuses to boot** if `ENVIRONMENT=production` and this is still `["*"]` |
| `RATE_LIMIT_ENABLED`/`RATE_LIMIT_*` | Enabled by default; tune per-endpoint limits if production traffic patterns differ from the defaults — see `.env.example` and `docs/SECURITY.md` |
| `APP_PUBLIC_BASE_URL` | Must be the real publicly-reachable HTTPS URL — Billplz's callback needs to reach it directly |
| `BILLPLZ_*`, `CLOUDINARY_*`, `FIREBASE_*`, email provider keys | Production credentials, not sandbox — see `docs/BILLPLZ_SETUP.md` and `.env.example` |

## TLS/HTTPS

Not handled by the application itself — terminate TLS at a reverse proxy
or load balancer (nginx, ALB, etc.) in front of uvicorn. Billplz's webhook
callback and any mobile client both require HTTPS in production. If running
behind a reverse proxy, note that `services/rate_limit.py`'s
`get_remote_address` key function reads `request.client.host` — configure
the proxy to forward the real client IP (e.g. `X-Forwarded-For`) and ensure
uvicorn/the ASGI stack is configured to trust it, otherwise every request
appears to come from the proxy's IP and shares one rate-limit bucket.

## Recommended next steps before a real production launch

1. Stand up an actual deployment target (container platform, VM, or
   managed service) with network access to the RDS instance without a
   manual SSH tunnel.
2. CI is wired up (see `.github/workflows/backend-ci.yml`) to run the test
   suite and enforce the 80% coverage gate on every PR/push to `main` —
   verify it's green before considering a release ready.
3. Obtain and configure real Billplz/Cloudinary/Firebase/email credentials
   (currently the biggest gap — see `docs/today-work/TEST_REPORT.md`).
4. Set `ENVIRONMENT=production`, a real `JWT_SECRET_KEY`, and real
   `ALLOWED_ORIGINS` — the app enforces the latter two at startup (see
   above), rate limiting is on by default, see `docs/SECURITY.md` for the
   full checklist and remaining known gaps.
5. Decide on the Socket.IO multi-worker scaling approach (`docs/SOCKET_SCALING.md`)
   if expecting more traffic than one process can handle.
