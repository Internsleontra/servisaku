// ─────────────────────────────────────────────────────────────────────────────
// Support SLA clocks. Pure — no DB, no clock of its own.
// ─────────────────────────────────────────────────────────────────────────────

const HOUR_MS = 3600_000;

/** First response / resolution targets, in hours, by priority. */
export const SLA = {
  urgent: { firstResponse: 1, resolution: 4 },
  high: { firstResponse: 4, resolution: 24 },
  normal: { firstResponse: 12, resolution: 72 },
  low: { firstResponse: 24, resolution: 168 },
};

export const ESCALATION_LEVELS = { AGENT: 1, SPECIALIST: 2, MANAGER: 3 };

/** How long after resolution a customer may reopen rather than file anew. */
export const REOPEN_WINDOW_DAYS = 7;
export const MAX_REOPENS = 3;

/** Categories that start above `normal` because they involve money or safety. */
const PRIORITY_BY_CATEGORY = {
  damage: 'high',
  refund: 'high',
  payment: 'high',
  complaint: 'high',
  report_customer: 'high',
};

/** Default priority for a new ticket. Admin can still override it. */
export function priorityFor(category) {
  return PRIORITY_BY_CATEGORY[category] || 'normal';
}

export function dueDates(priority = 'normal', from = new Date()) {
  const target = SLA[priority] || SLA.normal;
  return {
    slaFirstResponseAt: new Date(from.getTime() + target.firstResponse * HOUR_MS),
    slaResolutionAt: new Date(from.getTime() + target.resolution * HOUR_MS),
  };
}

/**
 * Which SLA clocks a ticket has breached.
 * A ticket already answered cannot breach first-response; one already resolved
 * cannot breach resolution.
 */
export function breaches(ticket, now = new Date()) {
  const out = [];
  const past = (d) => d && new Date(d) < now;
  const closed = ['resolved', 'closed'].includes(ticket.status);

  if (!ticket.firstResponseAt && !closed && past(ticket.slaFirstResponseAt)) out.push('first_response');
  if (!closed && past(ticket.slaResolutionAt)) out.push('resolution');
  return out;
}

/** May this ticket still be reopened by its owner? */
export function canReopen(ticket, now = new Date()) {
  if (!['resolved', 'closed'].includes(ticket.status)) return false;
  if ((ticket.reopenCount || 0) >= MAX_REOPENS) return false;
  const since = ticket.resolvedAt || ticket.closedAt;
  if (!since) return false;
  const days = (now.getTime() - new Date(since).getTime()) / (24 * HOUR_MS);
  return days <= REOPEN_WINDOW_DAYS;
}

/**
 * Queue ordering: breaching tickets first, then by priority, then oldest first.
 * Returns a sort comparator so the queue endpoint and any UI agree on order.
 */
export function queueComparator(now = new Date()) {
  const rank = { urgent: 0, high: 1, normal: 2, low: 3 };
  return (a, b) => {
    const aBreach = breaches(a, now).length > 0 ? 0 : 1;
    const bBreach = breaches(b, now).length > 0 ? 0 : 1;
    if (aBreach !== bBreach) return aBreach - bBreach;
    const aRank = rank[a.priority] ?? 2;
    const bRank = rank[b.priority] ?? 2;
    if (aRank !== bRank) return aRank - bRank;
    return new Date(a.createdAt) - new Date(b.createdAt);
  };
}
