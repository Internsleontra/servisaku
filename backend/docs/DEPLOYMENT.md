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
pub/sub bus — business-logic events (dispatch offers, chat messages) only
reach Socket.IO clients connected to the *same worker process* that handled
the triggering request. Running multiple uvicorn workers behind a load
balancer will cause real-time events to be missed by clients connected to a
different worker. Before scaling horizontally, either:

- switch `python-socketio`'s `AsyncServer` to a Redis-backed message queue
  (`python-socketio` supports this natively via `client_manager=
  socketio.AsyncRedisManager(...)`), or
- pin Socket.IO connections to a single worker/instance via sticky sessions
  at the load balancer.

This is a known, documented scaling limitation — not yet hit in practice
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
| `DATABASE_URL` | Point at production DB; use a connection pooler (PgBouncer) if scaling beyond a few workers |
| `JWT_SECRET_KEY` | **Must** be a real random secret, never the `config.py` placeholder default — see `docs/SECURITY.md` |
| `ALLOWED_ORIGINS` | **Must** be restricted from the dev default `["*"]` to real client origins |
| `APP_PUBLIC_BASE_URL` | Must be the real publicly-reachable HTTPS URL — Billplz's callback needs to reach it directly |
| `BILLPLZ_*`, `CLOUDINARY_*`, `FIREBASE_*`, email provider keys | Production credentials, not sandbox — see `docs/BILLPLZ_SETUP.md` and `.env.example` |

## TLS/HTTPS

Not handled by the application itself — terminate TLS at a reverse proxy
or load balancer (nginx, ALB, etc.) in front of uvicorn. Billplz's webhook
callback and any mobile client both require HTTPS in production.

## Recommended next steps before a real production launch

1. Stand up an actual deployment target (container platform, VM, or
   managed service) with network access to the RDS instance without a
   manual SSH tunnel.
2. Wire up CI to run `python -m pytest tests/` (see `docs/TESTING_GUIDE.md`)
   on every PR.
3. Obtain and configure real Billplz/Cloudinary/Firebase/email credentials
   (currently the biggest gap — see `docs/today-work/TEST_REPORT.md`).
4. Apply the `docs/SECURITY.md` "Known gaps" list (rate limiting, CORS
   restriction, JWT secret rotation strategy) before public launch.
5. Decide on the Socket.IO multi-worker scaling approach above if expecting
   more traffic than one process can handle.
