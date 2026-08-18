// ─────────────────────────────────────────────────────────────────────────────
// Graceful shutdown.
//
// Railway, Render, ECS and Kubernetes all announce a redeploy or scale-in with
// SIGTERM and then kill the process a short time later. Without a handler the
// default is immediate death: in-flight requests are cut mid-response, and a
// booking write can land without its notification ever being queued.
//
// The order below is deliberate:
//   1. stop the workers   — no NEW timer work starts while we are draining
//   2. close Socket.IO    — disconnect live clients, or `server.close()` waits
//                           forever on open websockets
//   3. close the HTTP server — stops accepting, finishes what is in flight
//   4. disconnect Prisma  — release the pool only once nothing can query
//
// This lives in its own module so it can be tested without importing
// server/index.js, which would start a real listener and every worker.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the signal handler.
 *
 * Everything it touches is injected, so a test can drive the whole sequence
 * with fakes and assert the order.
 *
 * @param {object}   deps
 * @param {object}   deps.server          http.Server — needs `.close(cb)`
 * @param {Function} [deps.closeIo]       disconnect Socket.IO, if attached
 * @param {Function} [deps.disconnectDb]  prisma.$disconnect
 * @param {Function[]} [deps.stopWorkers] worker stop functions
 * @param {number}   [deps.timeoutMs]     hard deadline before we stop being polite
 * @param {object}   [deps.log]
 * @param {Function} [deps.exit]
 */
export function createShutdownHandler({
  server,
  closeIo = () => {},
  disconnectDb = async () => {},
  stopWorkers = [],
  timeoutMs = 10_000,
  log = console,
  exit = process.exit,
} = {}) {
  let started = false;

  return async function shutdown(signal = 'SIGTERM') {
    // A platform may send SIGTERM then SIGKILL, and an operator may hit Ctrl-C
    // twice. Draining once is the only safe reading of that.
    if (started) {
      log.warn?.(`[shutdown] already shutting down, ignoring ${signal}`);
      return;
    }
    started = true;
    log.log?.(`[shutdown] ${signal} received — draining`);

    // If a socket refuses to close we must still exit, or the platform SIGKILLs
    // us anyway and we lose the chance to log why. Non-zero: this is not clean.
    const forced = setTimeout(() => {
      log.error?.(`[shutdown] did not finish within ${timeoutMs}ms — forcing exit`);
      exit(1);
    }, timeoutMs);
    if (forced.unref) forced.unref();

    try {
      for (const stop of stopWorkers) {
        try {
          stop();
        } catch (err) {
          // One uncooperative worker must not strand the rest of the sequence.
          log.error?.('[shutdown] worker stop failed:', err?.message || err);
        }
      }

      closeIo();

      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });

      await disconnectDb();

      clearTimeout(forced);
      log.log?.('[shutdown] complete');
      exit(0);
    } catch (err) {
      clearTimeout(forced);
      // Surfaced, never swallowed — a failed drain is a real signal.
      log.error?.('[shutdown] failed:', err?.message || err);
      exit(1);
    }
  };
}

/**
 * Log an unhandled rejection with its context, then exit non-zero.
 *
 * This preserves Node's own fail-fast default (unhandled rejections have
 * terminated the process since v15) while adding a line that says what actually
 * rejected — the default output is easy to lose in a platform log. The process
 * is left in an unknown state after one, so continuing would be worse than
 * restarting: the platform brings it straight back.
 */
export function createUnhandledRejectionHandler({ log = console, exit = process.exit } = {}) {
  return function onUnhandledRejection(reason) {
    log.error?.('[fatal] unhandled promise rejection:', reason?.stack || reason?.message || reason);
    exit(1);
  };
}
