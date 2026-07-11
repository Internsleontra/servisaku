# Socket.IO Horizontal Scaling Strategy

**Status: documentation only.** No Redis (or any other infrastructure) has
been deployed as part of this. This document explains why the current
single-process real-time layer won't survive running multiple worker
processes, and lays out the Redis-backed approach to take *when* that
becomes necessary — see `docs/DEPLOYMENT.md`'s recommended next steps for
when this applies.

## Current single-process architecture

Everything real-time in this backend lives in one running process, holding
three separate pieces of state entirely in memory:

1. **`services/realtime/socket_server.py`'s `_sessions` dict** — `sid ->
   {user_id, role, consumer_id, partner_id, rooms, last_seen}`. This is the
   only record of who is currently connected and which booking rooms they're
   in for presence purposes (`presence:online`/`presence:offline` events).
2. **`python-socketio`'s own internal room/session manager** — the default
   `AsyncServer(async_mode="asgi")` configuration (`main.py`'s `socket_app`)
   uses an in-memory `BaseManager` for Engine.IO session tracking and Socket.IO
   room membership (`sio.enter_room`/`sio.emit(..., room=...)`).
3. **`services/realtime/events.py`'s `_subscribers` list** — the in-process
   pub/sub bus that decouples business logic (the dispatch engine, payment
   confirmation, chat) from the Socket.IO layer. `emit()` fans out to
   whatever handlers registered via `subscribe()` in *this* process.

All three are plain Python objects (`dict`, `list`, socketio's default
manager) with no cross-process visibility whatsoever.

## Why in-memory state doesn't scale across workers

Running `uvicorn main:socket_app --workers 4` starts 4 independent OS
processes, each with its own copy of all three data structures above. A
concrete failure sequence with 2 workers:

1. Partner A's mobile client opens a WebSocket connection; the load balancer
   routes it to **worker 1**. `_sessions` and socketio's room manager on
   worker 1 now know about Partner A's socket.
2. A consumer creates a booking; the request is routed to **worker 2**
   (a stateless REST call, any worker can handle it). Smart Dispatch
   (`services/dispatch/engine.py`) creates the offer and calls
   `events.emit("dispatch.offer_created", ...)`.
3. `events.emit` only has subscribers registered in **worker 2**'s process
   (`socket_server.py`'s `_handle_business_event`, subscribed on that
   worker's own import of the module). It calls `sio.emit(..., room=
   "partner:{id}")` — but worker 2's socketio room manager has never heard
   of Partner A's socket, because that socket is connected to worker 1.
4. **The event is silently dropped.** Partner A never receives the job
   offer over Socket.IO, even though the offer row was correctly created in
   `job_dispatches` and would show up if they polled a REST endpoint.

This isn't a hypothetical — it's the direct, mechanical consequence of every
one of the three data structures above being process-local. It was not hit
during development/testing because verification has only ever run a single
process (see `docs/DEPLOYMENT.md`).

Sticky sessions at the load balancer (pinning a client to the same worker
for the lifetime of its connection) work around problem #1/#2 (a given
socket's *own* connection stays on one worker) but do **not** fix step 3 —
the event still needs to reach whichever worker holds that partner's socket,
and sticky sessions alone don't give workers a way to talk to each other.

## Redis manager approach

`python-socketio` has built-in support for exactly this via
`socketio.AsyncRedisManager`, which replaces the default in-memory room/
session manager with one backed by Redis pub/sub:

```python
# services/realtime/socket_server.py
import socketio

mgr = socketio.AsyncRedisManager(settings.SOCKETIO_REDIS_URL)  # e.g. redis://localhost:6379/0
sio = socketio.AsyncServer(
    async_mode="asgi",
    client_manager=mgr,
    cors_allowed_origins=settings.ALLOWED_ORIGINS if settings.ALLOWED_ORIGINS != ["*"] else "*",
)
```

Every worker connects to the same Redis instance. When any worker calls
`sio.emit(..., room="partner:{id}")`, the manager publishes the event to
Redis; every worker subscribed to Redis receives it and re-emits to any
locally-connected sockets that are actually in that room. This solves data
structure #2 above completely — room/event propagation "just works" across
workers with no application code changes beyond swapping the manager.

**This does not, by itself, fix data structures #1 and #3.** Those need
separate handling:

- **`_sessions` (presence)** — either accept that presence tracking becomes
  eventually-consistent/best-effort (each worker only knows about its own
  connections' `last_seen`, and a full "who's online" view would need to
  query all workers or move the dict into Redis too — e.g. a Redis hash
  keyed by `sid`, written on connect/heartbeat/disconnect, read by whichever
  worker needs the full picture), or scope down what presence guarantees are
  actually needed (per-booking-room presence, which `AsyncRedisManager`
  already broadcasts correctly via `presence:online`/`presence:offline`
  emits, may be sufficient without a shared `_sessions` store at all).
- **`services/realtime/events.py`'s in-process bus** — this is *not*
  automatically fixed by `AsyncRedisManager`, since it's this project's own
  pub/sub, unrelated to socketio's internal manager. The business-event
  bridge (`_handle_business_event`) already runs on every worker (each
  worker imports `socket_server.py` and subscribes on startup), so as long
  as the *emitting* worker also has a Socket.IO layer wired to the same
  Redis manager, calling `sio.emit(...)` from any worker correctly reaches
  sockets on other workers — because propagation happens inside `AsyncRedisManager`,
  not inside `events.py`. In other words: once `AsyncRedisManager` is in
  place, `events.emit()` → `_handle_business_event()` → `sio.emit()` already
  works correctly cross-worker, since the last step is the one that now
  goes through Redis. No change needed to `events.py` itself.

## Presence considerations

Given the above, the practical scope of "presence" that needs shared state
is narrower than it first appears:

- **Per-booking online/offline** (`presence:online`/`presence:offline`,
  used while a consumer/partner has a booking's chat screen open): already
  correctly broadcast cross-worker once `AsyncRedisManager` is wired in,
  since these are just `sio.emit(..., room=...)` calls like any other.
- **Global "is this user connected at all" / `last_seen` heartbeat data**
  (currently `_sessions[sid]["last_seen"]`): this is the piece that
  genuinely needs a shared store if it's ever exposed outside the process
  that owns the socket (e.g. an admin "online partners" dashboard). Not
  currently exposed anywhere — `get_connected_session_count()` in
  `socket_server.py` is the only consumer today, and it would need to
  become a Redis-backed count (e.g. `INCR`/`DECR` on connect/disconnect)
  rather than `len(_sessions)` to stay accurate across workers.

## Deployment topology

```
                         ┌─────────────────┐
        Client (mobile) ─┤  Load balancer   │  (sticky sessions recommended
                         │  / reverse proxy │   but not strictly required
                         └────────┬─────────┘   once AsyncRedisManager is in
                                  │              place — see note below)
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
        ┌───────────┐       ┌───────────┐       ┌───────────┐
        │ uvicorn    │       │ uvicorn    │       │ uvicorn    │
        │ worker 1   │       │ worker 2   │       │ worker N   │
        │ (socket_app)│      │ (socket_app)│      │ (socket_app)│
        └─────┬──────┘       └─────┬──────┘       └─────┬──────┘
              │                    │                    │
              └────────────────────┼────────────────────┘
                                    ▼
                          ┌───────────────────┐
                          │  Redis (pub/sub)   │
                          │  AsyncRedisManager │
                          └───────────────────┘
                                    │
                                    ▼
                          ┌───────────────────┐
                          │  servisakudb       │
                          │  (unchanged —      │
                          │  every worker keeps│
                          │  its own DB pool)  │
                          └───────────────────┘
```

**On sticky sessions:** Socket.IO's Engine.IO transport can use HTTP
long-polling as a fallback before/instead of upgrading to a real WebSocket;
long-polling issues multiple independent HTTP requests per "connection,"
which must all land on the same worker without `AsyncRedisManager` handling
that reconnection state. If the deployment can guarantee WebSocket-only
transport (no long-polling fallback) sticky sessions become unnecessary for
correctness, but are still good practice for connection-reuse efficiency.
Given this project has never needed to tune transport settings, the safe
default recommendation is: keep sticky sessions at the load balancer
regardless of `AsyncRedisManager` being in place.

The dispatch expiry-sweep background worker
(`services/dispatch/background.py`, started in `main.py`'s lifespan) has the
same multi-worker caveat independently noted in `docs/DEPLOYMENT.md` — each
worker runs its own sweep loop, which is harmless duplication (its queries
are idempotent per-row) but worth remembering separately from the Socket.IO
concern here.

## Migration steps

None of these have been executed — this is the ordered plan for when
horizontal scaling is actually needed:

1. **Provision Redis** (managed service or self-hosted) reachable from every
   app worker. Not required for a single-process deployment — this project
   has run entirely without it so far.
2. **Add `SOCKETIO_REDIS_URL` to `config.py`/`.env.example`**, following the
   same pattern as `RATE_LIMIT_STORAGE_URI` (see `docs/SECURITY.md`) — a
   connection string, empty/unset by default, feature-gated so local
   single-process dev keeps working with zero Redis dependency.
3. **Swap `socket_server.py`'s `AsyncServer` construction** to pass
   `client_manager=socketio.AsyncRedisManager(settings.SOCKETIO_REDIS_URL)`
   when the setting is present, falling back to the current in-memory
   manager otherwise (so `ENVIRONMENT=development` never requires Redis).
4. **Decide on `_sessions`/presence scope** per the Presence considerations
   section above — likely: leave `_sessions` as a local best-effort cache
   for the connect/disconnect handlers' own bookkeeping, and only move
   `get_connected_session_count()` to a Redis counter if/when an admin
   "who's online" feature is actually built (nothing currently depends on
   it beyond `/health`'s `connected_sessions` field, which would then
   correctly become a global count instead of "this worker's count").
5. **Load-test with 2 workers before going to N.** Verify the exact failure
   sequence described above (offer created on one worker, delivered to a
   socket on another) no longer drops events, using the existing
   `tests/test_socketio.py` pattern extended to explicitly spin up two
   server processes against the same Redis instance.
6. **Roll out behind sticky sessions** at the load balancer regardless (see
   deployment topology above), then scale `--workers` up.

Each step is additive and independently reversible — a deployment can stop
at step 1/2 (Redis provisioned but `SOCKETIO_REDIS_URL` unset) with zero
behavior change, and step 3's fallback means a single-worker deployment
never needs Redis at all.
