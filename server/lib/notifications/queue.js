// ─────────────────────────────────────────────────────────────────────────────
// Lightweight in-process job runner for out-of-band notification work (sending
// email/SMS/push, which must never block the API response) plus a poller that
// releases future-dated ("scheduled") notifications when they come due.
//
// It's intentionally dependency-free but hides behind a small adapter interface
// so a durable backend (BullMQ + Redis) can be dropped in later without touching
// callers — swap the implementation via `setQueueAdapter`.
// ─────────────────────────────────────────────────────────────────────────────

// Default adapter: run the task on the next tick with bounded retries + backoff.
const inProcessAdapter = {
  async enqueue(task, { retries = 2, backoffMs = 500, label = 'task' } = {}) {
    setImmediate(async () => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          await task();
          return;
        } catch (err) {
          if (attempt === retries) {
            console.error(`[notifications] ${label} failed after ${retries + 1} attempts:`, err?.message || err);
          } else {
            await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
          }
        }
      }
    });
  },
};

let adapter = inProcessAdapter;

export function setQueueAdapter(next) {
  adapter = next || inProcessAdapter;
}

/** Fire a best-effort async task off the request path. Never rejects to callers. */
export function enqueue(task, opts) {
  return adapter.enqueue(task, opts);
}

// ─── Scheduled-notification poller ───────────────────────────────────────────
let timer = null;

/**
 * Periodically release notifications whose `scheduledAt` has passed and are still
 * `queued`. `release(notification)` should perform the actual delivery (persist
 * sentAt, emit realtime, send channels) and is provided by the dispatcher to
 * avoid a circular import.
 */
export function startScheduler(prisma, release, { intervalMs = 60_000 } = {}) {
  if (timer) return timer;
  const tick = async () => {
    try {
      const due = await prisma.notification.findMany({
        where: { deliveryStatus: 'queued', scheduledAt: { not: null, lte: new Date() } },
        take: 100,
        orderBy: { scheduledAt: 'asc' },
      });
      for (const n of due) {
        try { await release(n); } catch (err) {
          console.error('[notifications] scheduled release failed:', err?.message || err);
        }
      }
    } catch (err) {
      console.error('[notifications] scheduler tick failed:', err?.message || err);
    }
  };
  timer = setInterval(tick, intervalMs);
  if (timer.unref) timer.unref(); // don't keep the process alive just for this
  return timer;
}

export function stopScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
}
