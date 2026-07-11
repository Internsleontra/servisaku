# Environment Setup Guide

## Prerequisites

- Python 3.11+ (developed/tested against 3.14)
- Access to the shared `servisakudb` PostgreSQL instance (AWS RDS,
  `ap-south-1`, PostGIS enabled) — ask a team member for SSH bastion access
- Git

## 1. Clone and install

```bash
git clone https://github.com/Dineshkuppuraj17/servisaku-partner-consumer.git
cd servisaku-partner-consumer/backend
pip install -r requirements.txt
```

## 2. Database access — SSH tunnel to the shared RDS instance

The database is not publicly reachable — it's inside a private VPC, reached
through a bastion host:

```bash
ssh -L 15433:servisaku.ctc4qmuwcp6a.ap-south-1.rds.amazonaws.com:5432 <your-user>@<bastion-host>
```

Leave this running in a background terminal (or use `-N` + `&` /
`ServerAliveInterval=30` to keep it alive during long sessions — see
`docs/DEPLOYMENT.md` for the exact flags used during development). The
tunnel exposes the RDS instance on `localhost:15433` for the duration of
the SSH session; if it drops (idle timeout), your app will fail to boot
with `Cannot connect to PostgreSQL` — just reconnect the tunnel.

## 3. Configure `.env`

```bash
cp .env.example .env
```

At minimum, set:

```env
DATABASE_URL=postgresql+asyncpg://<user>:<password>@127.0.0.1:15433/servisakudb
JWT_SECRET_KEY=<a real random secret — never use the placeholder default>
```

Everything else in `.env.example` (Billplz, Cloudinary, Firebase, email
providers) is optional for local development — features that need them
fail cleanly (503 "not configured") rather than crashing, and this is
disclosed, not hidden, in `API_TESTING_REPORT.md` and
`docs/today-work/TEST_REPORT.md`.

## 4. Seed test data

```bash
python seed.py
```

Idempotent — safe to run repeatedly. Creates the test accounts documented
in `README.md`, sample bookings/jobs/earnings, PostGIS-tagged partners for
Smart Dispatch testing, and assigns `SUPER_ADMIN` to the seed admin account
(required for any `/admin/*` endpoint to work at all — see
`docs/ADMIN_BACKEND.md`).

## 5. Run

```bash
uvicorn main:socket_app --reload --port 8000
```

Verify: `curl http://localhost:8000/health` should return
`{"status": "healthy", "database": {"connected": true, ...}}`.
Swagger UI: http://localhost:8000/docs

## 6. Run tests

```bash
python -m pytest tests/ -v --cov=. --cov-report=term-missing
```

See `docs/TESTING_GUIDE.md` for details, including how to also run the
Socket.IO tests (need the server actually running).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `RuntimeError: Cannot connect to PostgreSQL` on startup | SSH tunnel not running or dropped | Reconnect the tunnel (step 2) |
| `Invalid or expired token` mid-session | Access tokens expire in 15 minutes by default | Re-login (`POST /auth/login`) to get a fresh token |
| `503 media_storage_not_configured` / similar on uploads/payments/push | Optional third-party credentials not set in `.env` | Expected in dev without real credentials — see step 3 |
| Admin endpoints all `403` even with the seed admin token | `seed.py` wasn't run, or ran before the RBAC migration | Re-run `python seed.py` — it idempotently assigns `SUPER_ADMIN` |
