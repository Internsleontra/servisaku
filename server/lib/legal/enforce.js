// ─────────────────────────────────────────────────────────────────────────────
// Acceptance enforcement middleware.
//
// Applied NARROWLY, and that is the important design decision. Gating every
// endpoint would lock a user out of the very screens they need — including
// support, where they would go to ask why they are locked out. So enforcement
// covers only value-creating actions: creating a booking, starting a payment,
// submitting a partner application.
//
// Reading, browsing, viewing existing bookings, and support all stay open. A
// user who has not re-accepted keeps access to everything they already have;
// they simply cannot start something new until they do.
// ─────────────────────────────────────────────────────────────────────────────
import { pendingFor, mapDocumentOut } from './index.js';

/**
 * Blocks a request when the caller has outstanding required documents.
 * Responds 403 with a machine-readable code so the client can show the right
 * modal rather than guessing from the message.
 *
 * @param {object} [opts]
 * @param {string[]} [opts.methods]  which verbs to gate (default: POST only)
 * @param {(string|RegExp)[]} [opts.skip]  paths to leave open even on those verbs
 */
export function requireAcceptance({ methods = ['POST'], skip = [] } = {}) {
  const skipMatch = (path) => skip.some((s) => (s instanceof RegExp ? s.test(path) : path.startsWith(s)));

  return async (req, res, next) => {
    try {
      // Reads are never gated. Someone who has not re-accepted must still be
      // able to see their existing bookings, invoices and payment history —
      // withholding those is punitive and serves no legal purpose.
      if (!methods.includes(req.method)) return next();
      if (skipMatch(req.path)) return next();
      if (!req.user?.id) return next(); // authenticate() runs first and owns 401

      const pending = await pendingFor(req.user);
      if (pending.length === 0) return next();

      return res.status(403).json({
        error: 'Please accept the updated terms to continue',
        code: 'legal_acceptance_required',
        documents: pending.map((d) => mapDocumentOut(d)),
      });
    } catch (err) {
      // A failure to check must not block the platform. Log and let it through —
      // an outage in the legal check should not stop people booking services.
      console.error('[legal] acceptance check failed:', err?.message || err);
      return next();
    }
  };
}
