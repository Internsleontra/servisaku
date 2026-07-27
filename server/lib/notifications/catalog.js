// ─────────────────────────────────────────────────────────────────────────────
// Notification catalog — the single source of truth for every notification event.
//
// Each entry maps an event key → how that notification is rendered and delivered:
//   category   one of CATEGORIES (drives preference gating + UI filter tabs)
//   priority   low | normal | high | urgent  (urgent bypasses Do-Not-Disturb)
//   icon       emoji rendered on the notification card
//   role       consumer | partner  (which side of the marketplace receives it)
//   title      string | (data) => string
//   message    string | (data) => string
//   actionUrl  optional string | (data) => string  — deep link the CTA opens
//   ctaLabel   optional label for the CTA button
//   channels   default delivery channels for this event (subject to user prefs)
//   email      optional { subject, ... } — presence means "email-worthy"
//   sms        optional (data) => string — presence means "sms-worthy"
//
// Keep this file free of side effects: it only describes notifications.
// ─────────────────────────────────────────────────────────────────────────────

export const CATEGORIES = [
  'bookings', 'jobs', 'payments', 'wallet',
  'promotions', 'support', 'security', 'reviews', 'system',
];

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
export const CHANNELS = ['in_app', 'push', 'email', 'sms'];

// Short human ref for a booking/payment id, e.g. "BK-1A2B3C4D".
export const shortRef = (prefix, id) =>
  id ? `${prefix}-${String(id).slice(-8).toUpperCase()}` : `${prefix}-—`;

const bookingUrl = (d) => (d.bookingId ? `/bookings/${d.bookingId}` : '/bookings');
const jobUrl = (d) => (d.bookingId ? `/jobs/${d.bookingId}` : '/jobs');

// ─── Event definitions ───────────────────────────────────────────────────────
export const CATALOG = {
  // ── Consumer: booking lifecycle ──────────────────────────────────────────
  booking_created: {
    category: 'bookings', priority: 'normal', icon: '📝', role: 'consumer',
    title: 'Booking received',
    message: (d) => `Your ${d.serviceName || 'service'} request has been received. We're finding you a pro.`,
    actionUrl: bookingUrl, ctaLabel: 'View Booking',
    channels: ['in_app', 'email'],
    email: { subject: (d) => `Booking received — ${d.serviceName || 'ServisAku'}` },
  },
  booking_confirmed: {
    category: 'bookings', priority: 'high', icon: '✅', role: 'consumer',
    title: 'Booking confirmed',
    message: (d) => `Your ${d.serviceName || 'service'} is confirmed for ${d.date || 'your selected date'}${d.timeSlot ? ` at ${d.timeSlot}` : ''}.`,
    actionUrl: bookingUrl, ctaLabel: 'View Booking',
    channels: ['in_app', 'email', 'sms'],
    email: { subject: (d) => `Booking confirmed — ${d.serviceName || 'ServisAku'}` },
    sms: (d) => `ServisAku: Your ${d.serviceName || 'service'} is confirmed for ${d.date || ''} ${d.timeSlot || ''}. Ref ${d.ref || ''}`,
  },
  booking_pending: {
    category: 'bookings', priority: 'normal', icon: '⏳', role: 'consumer',
    title: 'Awaiting confirmation',
    message: (d) => `We're matching your ${d.serviceName || 'service'} with an available professional.`,
    actionUrl: bookingUrl, channels: ['in_app'],
  },
  booking_accepted: {
    category: 'bookings', priority: 'high', icon: '🤝', role: 'consumer',
    title: 'A professional accepted your booking',
    message: (d) => `${d.partnerName || 'A professional'} accepted your ${d.serviceName || 'service'} request.`,
    actionUrl: bookingUrl, ctaLabel: 'View Booking', channels: ['in_app', 'push'],
  },
  professional_assigned: {
    category: 'bookings', priority: 'high', icon: '👷', role: 'consumer',
    title: 'Professional assigned',
    message: (d) => `${d.partnerName || 'Your professional'} has been assigned to your ${d.serviceName || 'service'}.`,
    actionUrl: bookingUrl, ctaLabel: 'View Booking', channels: ['in_app', 'email', 'push'],
    email: { subject: 'Your ServisAku professional has been assigned' },
  },
  professional_on_the_way: {
    category: 'bookings', priority: 'high', icon: '🚗', role: 'consumer',
    title: 'Your professional is on the way',
    message: (d) => `${d.partnerName || 'Your professional'} is heading to you${d.eta ? ` — ETA ${d.eta}` : ''}.`,
    actionUrl: (d) => (d.bookingId ? `/tracking/${d.bookingId}` : bookingUrl(d)),
    ctaLabel: 'Track', channels: ['in_app', 'push', 'sms'],
    sms: (d) => `ServisAku: ${d.partnerName || 'Your pro'} is on the way${d.eta ? `, ETA ${d.eta}` : ''}.`,
  },
  professional_arrived: {
    category: 'bookings', priority: 'urgent', icon: '📍', role: 'consumer',
    title: 'Your professional has arrived',
    message: (d) => `${d.partnerName || 'Your professional'} has arrived at your location.`,
    actionUrl: bookingUrl, channels: ['in_app', 'push', 'sms'],
    sms: (d) => `ServisAku: ${d.partnerName || 'Your pro'} has arrived.`,
  },
  otp_generated: {
    category: 'bookings', priority: 'urgent', icon: '🔐', role: 'consumer',
    title: 'Your service start code',
    message: (d) => `Share code ${d.otp || '••••'} with ${d.partnerName || 'your professional'} to start the service.`,
    actionUrl: bookingUrl, channels: ['in_app', 'sms'],
    sms: (d) => `ServisAku: Your service start code is ${d.otp || '••••'}. Do not share except with your professional.`,
  },
  otp_verified: {
    category: 'bookings', priority: 'normal', icon: '🔓', role: 'consumer',
    title: 'Service code verified',
    message: 'Your start code was verified. The service is beginning now.',
    actionUrl: bookingUrl, channels: ['in_app'],
  },
  service_started: {
    category: 'bookings', priority: 'normal', icon: '▶️', role: 'consumer',
    title: 'Service started',
    message: (d) => `Your ${d.serviceName || 'service'} is now in progress.`,
    actionUrl: bookingUrl, channels: ['in_app', 'push'],
  },
  service_completed: {
    category: 'bookings', priority: 'high', icon: '🎉', role: 'consumer',
    title: 'Service completed',
    message: (d) => `Your ${d.serviceName || 'service'} is complete. We hope you loved it!`,
    actionUrl: bookingUrl, ctaLabel: 'View Invoice', channels: ['in_app', 'email', 'push'],
    email: { subject: (d) => `Service completed — ${d.serviceName || 'ServisAku'}` },
  },
  booking_cancelled: {
    category: 'bookings', priority: 'high', icon: '❌', role: 'consumer',
    title: 'Booking cancelled',
    message: (d) => `Your ${d.serviceName || 'service'} booking (${d.ref || ''}) has been cancelled.`,
    actionUrl: bookingUrl, channels: ['in_app', 'email'],
    email: { subject: 'Your ServisAku booking was cancelled' },
  },
  booking_rescheduled: {
    category: 'bookings', priority: 'high', icon: '🗓️', role: 'consumer',
    title: 'Booking rescheduled',
    message: (d) => `Your ${d.serviceName || 'service'} is now scheduled for ${d.date || ''}${d.timeSlot ? ` at ${d.timeSlot}` : ''}.`,
    actionUrl: bookingUrl, channels: ['in_app', 'email', 'sms'],
    email: { subject: 'Your ServisAku booking was rescheduled' },
    sms: (d) => `ServisAku: Booking rescheduled to ${d.date || ''} ${d.timeSlot || ''}.`,
  },
  booking_reminder: {
    category: 'bookings', priority: 'high', icon: '⏰', role: 'consumer',
    title: 'Upcoming service reminder',
    message: (d) => `Reminder: your ${d.serviceName || 'service'} is ${d.when || 'coming up'}${d.timeSlot ? ` at ${d.timeSlot}` : ''}.`,
    actionUrl: bookingUrl, channels: ['in_app', 'push', 'sms'],
    sms: (d) => `ServisAku reminder: your ${d.serviceName || 'service'} is ${d.when || 'soon'} ${d.timeSlot || ''}.`,
  },
  booking_expired: {
    category: 'bookings', priority: 'normal', icon: '⌛', role: 'consumer',
    title: 'Booking request expired',
    message: (d) => `Your ${d.serviceName || 'service'} request expired without a match. Please try again.`,
    actionUrl: bookingUrl, channels: ['in_app'],
  },

  // ── Consumer: payments & wallet ──────────────────────────────────────────
  payment_initiated: {
    category: 'payments', priority: 'normal', icon: '💳', role: 'consumer',
    title: 'Payment initiated',
    message: (d) => `We're processing your payment${d.amount ? ` of ${d.amount}` : ''}.`,
    actionUrl: bookingUrl, channels: ['in_app'],
  },
  payment_successful: {
    category: 'payments', priority: 'high', icon: '💰', role: 'consumer',
    title: 'Payment successful',
    message: (d) => `Your payment${d.amount ? ` of ${d.amount}` : ''} was successful. Thank you!`,
    actionUrl: bookingUrl, ctaLabel: 'View Invoice', channels: ['in_app', 'email', 'sms'],
    email: { subject: 'Your ServisAku payment receipt' },
    sms: (d) => `ServisAku: Payment${d.amount ? ` of ${d.amount}` : ''} received. Ref ${d.ref || ''}.`,
  },
  payment_failed: {
    category: 'payments', priority: 'high', icon: '⚠️', role: 'consumer',
    title: 'Payment failed',
    message: (d) => `Your payment${d.amount ? ` of ${d.amount}` : ''} could not be processed. Please try again.`,
    actionUrl: bookingUrl, ctaLabel: 'Retry Payment', channels: ['in_app', 'email'],
    email: { subject: 'Your ServisAku payment failed' },
  },
  refund_initiated: {
    category: 'payments', priority: 'normal', icon: '↩️', role: 'consumer',
    title: 'Refund initiated',
    message: (d) => `A refund${d.amount ? ` of ${d.amount}` : ''} is being processed to your original payment method.`,
    actionUrl: bookingUrl, channels: ['in_app', 'email'],
    email: { subject: 'Your ServisAku refund is being processed' },
  },
  refund_completed: {
    category: 'payments', priority: 'high', icon: '✅', role: 'consumer',
    title: 'Refund completed',
    message: (d) => `Your refund${d.amount ? ` of ${d.amount}` : ''} has been completed.`,
    actionUrl: bookingUrl, channels: ['in_app', 'email', 'sms'],
    email: { subject: 'Your ServisAku refund is complete' },
    sms: (d) => `ServisAku: Refund${d.amount ? ` of ${d.amount}` : ''} completed.`,
  },
  invoice_generated: {
    category: 'payments', priority: 'low', icon: '🧾', role: 'consumer',
    title: 'Invoice ready',
    message: (d) => `Your invoice for ${d.serviceName || 'your service'} is ready to view.`,
    actionUrl: bookingUrl, ctaLabel: 'View Invoice', channels: ['in_app', 'email'],
    email: { subject: 'Your ServisAku invoice' },
  },
  wallet_cashback_added: {
    category: 'wallet', priority: 'normal', icon: '🎁', role: 'consumer',
    title: 'Cashback added',
    message: (d) => `${d.amount || 'Cashback'} has been added to your ServisAku wallet.`,
    actionUrl: '/wallet', ctaLabel: 'View Wallet', channels: ['in_app', 'push'],
  },
  coupon_applied: {
    category: 'wallet', priority: 'low', icon: '🏷️', role: 'consumer',
    title: 'Coupon applied',
    message: (d) => `Coupon ${d.code || ''} applied${d.amount ? ` — you saved ${d.amount}` : ''}.`,
    actionUrl: bookingUrl, channels: ['in_app'],
  },
  coupon_expiring: {
    category: 'wallet', priority: 'low', icon: '⏳', role: 'consumer',
    title: 'Coupon expiring soon',
    message: (d) => `Your coupon ${d.code || ''} expires ${d.when || 'soon'}. Use it before it's gone!`,
    actionUrl: '/wallet', channels: ['in_app', 'push'],
  },

  // ── Consumer: reviews & support ──────────────────────────────────────────
  review_request: {
    category: 'reviews', priority: 'normal', icon: '⭐', role: 'consumer',
    title: 'How was your service?',
    message: (d) => `Please rate your ${d.serviceName || 'recent service'} with ${d.partnerName || 'your professional'}.`,
    actionUrl: (d) => (d.bookingId ? `/bookings/${d.bookingId}/review` : '/bookings'),
    ctaLabel: 'Rate Service', channels: ['in_app', 'push'],
  },
  review_thanks: {
    category: 'reviews', priority: 'low', icon: '🙏', role: 'consumer',
    title: 'Thanks for your review',
    message: 'Your feedback helps us keep quality high. Thank you!',
    channels: ['in_app'],
  },
  support_ticket_created: {
    category: 'support', priority: 'normal', icon: '🎫', role: 'consumer',
    title: 'Support ticket created',
    message: (d) => `Your support ticket ${d.ticketRef || ''} has been created. We'll be in touch soon.`,
    actionUrl: (d) => (d.ticketId ? `/support/${d.ticketId}` : '/support'),
    channels: ['in_app', 'email'],
    email: { subject: 'We received your ServisAku support request' },
  },
  support_reply: {
    category: 'support', priority: 'high', icon: '💬', role: 'consumer',
    title: 'Support replied',
    message: (d) => `You have a new reply on ticket ${d.ticketRef || ''}.`,
    actionUrl: (d) => (d.ticketId ? `/support/${d.ticketId}` : '/support'),
    ctaLabel: 'View Reply', channels: ['in_app', 'push', 'email'],
    email: { subject: 'New reply to your ServisAku support ticket' },
  },
  support_ticket_closed: {
    category: 'support', priority: 'low', icon: '✔️', role: 'consumer',
    title: 'Support ticket closed',
    message: (d) => `Your support ticket ${d.ticketRef || ''} has been resolved.`,
    actionUrl: '/support', channels: ['in_app'],
  },

  // ── Consumer: promotions ─────────────────────────────────────────────────
  promo_offer: {
    category: 'promotions', priority: 'low', icon: '🎉', role: 'consumer',
    title: (d) => d.title || 'Special offer',
    message: (d) => d.body || 'A new offer is waiting for you.',
    actionUrl: (d) => d.url || '/offers', ctaLabel: 'View Offer', channels: ['in_app', 'push'],
  },

  // ── Shared: security ─────────────────────────────────────────────────────
  new_login: {
    category: 'security', priority: 'high', icon: '🔑', role: 'consumer',
    title: 'New login detected',
    message: (d) => `A new sign-in was detected${d.device ? ` from ${d.device}` : ''}${d.location ? ` in ${d.location}` : ''}.`,
    actionUrl: '/settings/security', channels: ['in_app', 'email'],
    email: { subject: 'New sign-in to your ServisAku account' },
  },
  password_changed: {
    category: 'security', priority: 'high', icon: '🔒', role: 'consumer',
    title: 'Password changed',
    message: 'Your account password was changed. If this wasn\'t you, contact support immediately.',
    actionUrl: '/settings/security', channels: ['in_app', 'email'],
    email: { subject: 'Your ServisAku password was changed' },
  },
  suspicious_login: {
    category: 'security', priority: 'urgent', icon: '🚨', role: 'consumer',
    title: 'Suspicious login blocked',
    message: (d) => `We blocked a suspicious sign-in attempt${d.location ? ` from ${d.location}` : ''}.`,
    actionUrl: '/settings/security', channels: ['in_app', 'email', 'sms'],
    email: { subject: 'Suspicious activity on your ServisAku account' },
    sms: () => 'ServisAku: We blocked a suspicious sign-in to your account. Secure it if this wasn\'t you.',
  },

  // ── Partner: job lifecycle ───────────────────────────────────────────────
  new_job_request: {
    category: 'jobs', priority: 'high', icon: '🆕', role: 'partner',
    title: 'New job request',
    message: (d) => `A new ${d.serviceName || 'job'} is available${d.area ? ` in ${d.area}` : ''}${d.payout ? ` — earn ${d.payout}` : ''}.`,
    actionUrl: jobUrl, ctaLabel: 'View Job', channels: ['in_app', 'push'],
  },
  job_assigned: {
    category: 'jobs', priority: 'high', icon: '📋', role: 'partner',
    title: 'Job assigned to you',
    message: (d) => `You've been assigned a ${d.serviceName || 'job'}${d.date ? ` for ${d.date}` : ''}.`,
    actionUrl: jobUrl, ctaLabel: 'View Job', channels: ['in_app', 'push', 'email'],
    email: { subject: 'A new ServisAku job has been assigned to you' },
  },
  job_cancelled: {
    category: 'jobs', priority: 'high', icon: '❌', role: 'partner',
    title: 'Job cancelled',
    message: (d) => `The ${d.serviceName || 'job'} (${d.ref || ''}) was cancelled${d.by ? ` by the ${d.by}` : ''}.`,
    actionUrl: jobUrl, channels: ['in_app', 'push'],
  },
  customer_rescheduled: {
    category: 'jobs', priority: 'high', icon: '🗓️', role: 'partner',
    title: 'Customer changed the schedule',
    message: (d) => `${d.customerName || 'The customer'} moved the ${d.serviceName || 'job'} to ${d.date || ''}${d.timeSlot ? ` at ${d.timeSlot}` : ''}.`,
    actionUrl: jobUrl, channels: ['in_app', 'push'],
  },
  customer_arrived_flow: {
    category: 'jobs', priority: 'normal', icon: '📍', role: 'partner',
    title: 'Customer is ready',
    message: (d) => `${d.customerName || 'The customer'} is ready for you to begin.`,
    actionUrl: jobUrl, channels: ['in_app', 'push'],
  },
  customer_confirmed_completion: {
    category: 'jobs', priority: 'normal', icon: '✅', role: 'partner',
    title: 'Customer confirmed completion',
    message: (d) => `${d.customerName || 'The customer'} confirmed the ${d.serviceName || 'job'} is complete.`,
    actionUrl: jobUrl, channels: ['in_app'],
  },

  // ── Partner: earnings ────────────────────────────────────────────────────
  payment_released: {
    category: 'payments', priority: 'high', icon: '💸', role: 'partner',
    title: 'Payment released',
    message: (d) => `Your earnings${d.amount ? ` of ${d.amount}` : ''} for ${d.serviceName || 'a completed job'} have been released.`,
    actionUrl: '/earnings', ctaLabel: 'View Earnings', channels: ['in_app', 'push', 'email'],
    email: { subject: 'Your ServisAku earnings have been released' },
  },
  earnings_credited: {
    category: 'payments', priority: 'high', icon: '🏦', role: 'partner',
    title: 'Earnings credited',
    message: (d) => `${d.amount || 'Your earnings'} has been credited to your account.`,
    actionUrl: '/earnings', ctaLabel: 'View Earnings', channels: ['in_app', 'push'],
  },
  weekly_earnings_summary: {
    category: 'payments', priority: 'low', icon: '📊', role: 'partner',
    title: 'Your weekly earnings',
    message: (d) => `You earned ${d.amount || '—'} across ${d.jobs || 0} jobs this week.`,
    actionUrl: '/earnings', channels: ['in_app', 'email'],
    email: { subject: 'Your ServisAku weekly earnings summary' },
  },
  incentive_earned: {
    category: 'payments', priority: 'normal', icon: '🌟', role: 'partner',
    title: 'Incentive earned',
    message: (d) => `You earned an incentive${d.amount ? ` of ${d.amount}` : ''}. Keep it up!`,
    actionUrl: '/earnings', channels: ['in_app', 'push'],
  },

  // ── Partner: account ─────────────────────────────────────────────────────
  profile_approved: {
    category: 'system', priority: 'high', icon: '🎊', role: 'partner',
    title: 'Profile approved',
    message: 'Congratulations! Your partner profile has been approved. You can now receive jobs.',
    actionUrl: '/profile', channels: ['in_app', 'push', 'email'],
    email: { subject: 'Your ServisAku partner profile is approved' },
  },
  documents_approved: {
    category: 'system', priority: 'normal', icon: '📄', role: 'partner',
    title: 'Documents approved',
    message: 'Your submitted documents have been verified and approved.',
    actionUrl: '/profile/documents', channels: ['in_app', 'push'],
  },
  documents_rejected: {
    category: 'system', priority: 'high', icon: '⚠️', role: 'partner',
    title: 'Documents need attention',
    message: (d) => `Some documents were rejected${d.reason ? `: ${d.reason}` : ''}. Please re-upload.`,
    actionUrl: '/profile/documents', ctaLabel: 'Re-upload', channels: ['in_app', 'push', 'email'],
    email: { subject: 'Action needed: your ServisAku documents' },
  },
  documents_expiring: {
    category: 'system', priority: 'normal', icon: '📅', role: 'partner',
    title: 'Documents expiring soon',
    message: (d) => `Your ${d.docName || 'document'} expires ${d.when || 'soon'}. Please renew it.`,
    actionUrl: '/profile/documents', channels: ['in_app', 'push'],
  },
  account_suspended_warning: {
    category: 'security', priority: 'urgent', icon: '🚫', role: 'partner',
    title: 'Account warning',
    message: (d) => `Your account is at risk of suspension${d.reason ? `: ${d.reason}` : ''}. Please review.`,
    actionUrl: '/profile', channels: ['in_app', 'push', 'email'],
    email: { subject: 'Important: your ServisAku account status' },
  },

  // ── Partner: reviews ─────────────────────────────────────────────────────
  customer_left_review: {
    category: 'reviews', priority: 'normal', icon: '⭐', role: 'partner',
    title: 'New customer review',
    message: (d) => `${d.customerName || 'A customer'} left you a ${d.rating ? `${d.rating}-star ` : ''}review.`,
    actionUrl: '/reviews', ctaLabel: 'View Review', channels: ['in_app', 'push'],
  },
  five_star_rating: {
    category: 'reviews', priority: 'normal', icon: '🌟', role: 'partner',
    title: 'You got a 5-star rating!',
    message: (d) => `${d.customerName || 'A customer'} rated you 5 stars. Amazing work!`,
    actionUrl: '/reviews', channels: ['in_app', 'push'],
  },
  low_rating_alert: {
    category: 'reviews', priority: 'high', icon: '📉', role: 'partner',
    title: 'Low rating received',
    message: (d) => `You received a ${d.rating || 'low'}-star review. Tap to see how you can improve.`,
    actionUrl: '/reviews', ctaLabel: 'View Feedback', channels: ['in_app'],
  },

  // ── Partner: support ─────────────────────────────────────────────────────
  customer_message: {
    category: 'support', priority: 'high', icon: '💬', role: 'partner',
    title: 'New customer message',
    message: (d) => `${d.customerName || 'A customer'} sent you a message${d.serviceName ? ` about ${d.serviceName}` : ''}.`,
    actionUrl: (d) => (d.bookingId ? `/jobs/${d.bookingId}/chat` : '/messages'),
    ctaLabel: 'Reply', channels: ['in_app', 'push'],
  },
};

// ─── Rendering ───────────────────────────────────────────────────────────────
const call = (v, d) => (typeof v === 'function' ? v(d) : v);

/**
 * Render a catalog event into a concrete, deliverable notification payload.
 * Unknown events fall back to a generic system notification so a missing catalog
 * entry never crashes a lifecycle hook.
 */
export function renderEvent(event, data = {}) {
  const def = CATALOG[event];
  if (!def) {
    return {
      event, category: 'system', priority: 'normal', icon: '🔔',
      role: data.role || 'consumer',
      title: data.title || 'Notification',
      message: data.message || data.body || '',
      actionUrl: data.actionUrl || null, ctaLabel: data.ctaLabel || null,
      channels: ['in_app'], emailSubject: null, smsBody: null,
    };
  }
  return {
    event,
    category: def.category,
    priority: def.priority || 'normal',
    icon: def.icon || '🔔',
    role: def.role || data.role || 'consumer',
    title: call(def.title, data),
    message: call(def.message, data),
    actionUrl: def.actionUrl ? call(def.actionUrl, data) : null,
    ctaLabel: def.ctaLabel || null,
    channels: def.channels || ['in_app'],
    emailSubject: def.email ? call(def.email.subject, data) || 'ServisAku notification' : null,
    smsBody: def.sms ? call(def.sms, data) : null,
  };
}

export function isKnownEvent(event) {
  return Object.prototype.hasOwnProperty.call(CATALOG, event);
}
