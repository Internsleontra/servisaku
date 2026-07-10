# Socket.IO Real-Time Architecture — Design & Operations Guide

Stage 5. Adds a JWT-authenticated, room-based Socket.IO layer over the
existing FastAPI app, and wires Smart Dispatch (Stage 4) and Chat into it so
consumers/partners get live updates instead of having to poll.

## Running it

`main.py` exposes **two** ASGI objects:

- `main:app` — the plain FastAPI app (used by `python -c "import main"`
  sanity checks, and anything that only cares about the REST API).
- `main:socket_app` — `socketio.ASGIApp(sio, other_asgi_app=app)`, the real
  entrypoint to run: `uvicorn main:socket_app --host 0.0.0.0 --port 8000`.
  It serves the REST API exactly as before, plus the Socket.IO/Engine.IO
  transport at `/socket.io`.

No new required environment variables — Socket.IO reuses the existing
`ALLOWED_ORIGINS` setting for `cors_allowed_origins`.

## Why a decoupled event bus (`services/realtime/events.py`)

Business logic (the dispatch engine, chat routes) needs to push real-time
events, but must not import the Socket.IO server module directly — that
would create a circular import (`services/realtime/socket_server.py` needs
to import models/business modules to resolve room membership on connect).
`services/realtime/events.py` is a tiny in-process pub/sub: business code
calls `await events.emit("dispatch.offer_created", {...})`;
`socket_server.py` calls `events.subscribe(handler)` once at import time.
Neither module imports the other.

**Important caveat, discovered live**: this only reaches subscribers
registered in the *same running process*. A one-off script (e.g. this
stage's own `simulate_payment.py` test helper, run as `python
simulate_payment.py`) that imports `routes.payments` and triggers
`_mark_payment_paid()` gets its own fresh, empty `_subscribers` list — the
event fires, finds zero subscribers, and does nothing, silently. This is a
non-issue in real operation (every business action runs inside the one
running app process, where the Socket.IO server registered itself as a
subscriber at startup) but caused a confusing false negative during manual
testing until traced down (see the two-bugs section below).

## JWT Socket Authentication

The client must connect with `auth={"token": "<access_token>"}`. The
`connect` handler decodes the token with the existing `auth.decode_token`
(same JWTs the REST API already issues), rejects the handshake outright
(`socketio.exceptions.ConnectionRefusedError`) on a missing/invalid/expired
token or the wrong token type — never allows an anonymous or unauthenticated
socket.

## Room scheme

| Room | Joined | Used for |
|---|---|---|
| `user:{user_id}` | every connection, any role | reserved for future direct-to-user pushes |
| `consumer:{consumer_id}` | role=consumer, on connect | e.g. `dispatch:status_update` for `dispatch.exhausted` (no assigned partner yet, so no booking-room participant exists on that side) |
| `partner:{partner_id}` | role=partner, on connect | `dispatch:job_offer` — a new offer goes straight to the offered partner, before they've joined any booking room |
| `booking:{booking_id}` | explicit `booking:join`, **permission-checked** | chat, presence, booking/dispatch status updates, partner location |

`booking:join` verifies the caller is the booking's consumer, its
*already-assigned* partner, or an admin, before allowing the join — a
partner who has only been *offered* a job (not yet accepted) cannot join
that booking's room; they only learn about it via their own `partner:{id}`
room until they accept.

## Events

**Client → Server**

| Event | Payload | Effect |
|---|---|---|
| `booking:join` / `booking:leave` | `{booking_id}` | room membership (join is permission-checked) |
| `heartbeat` | `{}` | updates in-memory `last_seen`, replies `heartbeat:ack` |
| `chat:typing` | `{booking_id, thread_id, is_typing}` | broadcast to booking room (ephemeral, no DB write) |
| `chat:send_message` | `{thread_id, message, attachment_s3_key?}` | persists a `ChatMessage`, broadcasts `chat:new_message` |
| `chat:read` | `{thread_id}` | marks the other party's unread messages read, broadcasts `chat:read_receipt` |
| `partner:location_update` | `{booking_id, lat, lng}` | broadcast only — **not persisted** (see below) |

**Server → Client**

| Event | Room | Source |
|---|---|---|
| `presence:online` / `presence:offline` | `booking:{id}` | on join / on disconnect |
| `heartbeat:ack` | direct to sender | `heartbeat` |
| `chat:new_message` | `booking:{id}` | `chat:send_message` (socket) or `POST /chat/threads/{id}/messages` (REST fallback, via the event bus) |
| `chat:read_receipt` | `booking:{id}` | `chat:read` (socket) or `POST /chat/threads/{id}/read` (REST) |
| `chat:typing` | `booking:{id}` | `chat:typing` |
| `partner:location` | `booking:{id}` | `partner:location_update` |
| `dispatch:job_offer` | `partner:{id}` | Smart Dispatch — new offer created |
| `dispatch:status_update` | `booking:{id}` (or `consumer:{id}` for `dispatch.exhausted`) | offer assigned/declined/expired/manually-overridden/exhausted |
| `booking:status_update` | `booking:{id}` | any `booking_status` change (payment confirmed, partner assigned, EN_ROUTE/ARRIVED/IN_PROGRESS/COMPLETED/cancelled) |

## Presence & partner location — deliberately not persisted

There's no dedicated "partner is online" or "live GPS trail" table in the
live schema. Presence is tracked **in-memory only**
(`services/realtime/socket_server.py::_sessions`, keyed by socket ID) —
inherently per-process and ephemeral, which is the correct scope for "is
this specific socket still connected" rather than a durable fact. Partner
GPS pings are broadcast live to the booking room but not written to the
database on every update (that would spam the table); the existing
`job_status_updates` table (with its own `location` geography column) is
available for meaningful status-change checkpoints if a future stage wants
durable location history, but wiring that up was out of scope here.

## Automatic reconnection

Provided by the Socket.IO/Engine.IO client libraries themselves (exponential
backoff, session resumption) — no custom code needed server-side beyond
correctly handling repeat `connect` events, which the JWT auth path already
does per-connection.

## Event Logging

`utils.logging`'s existing `structlog` setup is used for `socket_connected`
/ `socket_disconnected` lifecycle events. Per-message chat/dispatch traffic
is intentionally *not* logged at info level (would be extremely noisy) —
every chat message and dispatch offer is already durably recorded in
`chat_messages` / `job_dispatches` respectively, which is the real audit
trail.

## What was verified live (real `socketio.AsyncClient` connections, real JWTs)

Using a background task to keep Socket.IO clients connected while triggering
real HTTP requests against the running server from a second process
(necessary since the event bus only reaches same-process subscribers — see
above):

- Three simultaneous authenticated connections (two partners, one consumer).
- `dispatch:job_offer` reached exactly the offered partner's `partner:{id}`
  room the moment `start_dispatch()` ran on the server.
- Accepting the offer via the real `/dispatch/offers/{id}/accept` endpoint
  produced both `dispatch:status_update` (`dispatch.assigned`) and
  `booking:status_update` (`CONFIRMED -> PARTNER_ASSIGNED`) in the consumer's
  booking room.
- `POST /chat/threads/{id}/messages` (REST) correctly bridged through
  `events.emit` to a live `chat:new_message` broadcast.
- Socket-native `chat:send_message`, `chat:typing`, `chat:read`, and
  `partner:location_update` all round-tripped correctly to the other
  connected party in the same booking room.
- `heartbeat` → `heartbeat:ack` round-trip confirmed.

## Two real bugs found and fixed during this verification

Same two bugs documented in `docs/SMART_DISPATCH.md` (the asyncpg naive-
datetime timezone bug, and the `structlog` `event=` keyword collision) —
both were discovered *because* the Socket.IO verification kept turning up
apparently-missing events, which forced tracing the actual root causes
rather than assuming the real-time layer itself was broken. The Socket.IO
wiring itself (rooms, auth, event bridge) had no bugs once those two were
fixed and the test methodology accounted for the separate-process caveat
above.
