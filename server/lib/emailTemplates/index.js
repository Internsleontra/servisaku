// ─────────────────────────────────────────────────────────────────────────────
// Email templates.
//
// The dispatcher previously rendered ONE generic layout for every email — a
// title, a paragraph and a button. That is fine for "your professional arrived"
// and wrong for an invoice, a payout statement or a booking confirmation, all of
// which need structure: line items, amounts, dates, a tax breakdown.
//
// Per-event templates live here; the generic layout remains the fallback, so an
// event without a bespoke template still sends rather than failing.
//
// Templates live in code, versioned with the app, for the same reason the
// notification catalog does: reviewable in a PR and deployed atomically with the
// code that depends on them.
// ─────────────────────────────────────────────────────────────────────────────
import { layout, button, lineItems, amountRow, infoBox, escapeHtml } from './layout.js';

const APP_URL = (process.env.APP_WEB_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');

// Bilingual copy. NotificationPreference.language already exists and is en|ms.
const t = (locale, en, ms) => (locale === 'ms' ? ms : en);

/**
 * Per-event builders. Each receives ({ rendered, data, locale }) and returns
 * { subject, html, text }. Absence is not an error — the generic fallback runs.
 */
const TEMPLATES = {
  booking_confirmed: ({ rendered, data, locale }) => {
    const rows = [
      [t(locale, 'Service', 'Perkhidmatan'), data.serviceName || '—'],
      [t(locale, 'Date', 'Tarikh'), data.date || '—'],
      [t(locale, 'Time', 'Masa'), data.timeSlot || '—'],
      [t(locale, 'Reference', 'Rujukan'), data.ref || '—'],
    ];
    return {
      subject: rendered.emailSubject,
      html: layout({
        title: t(locale, 'Your booking is confirmed', 'Tempahan anda disahkan'),
        intro: rendered.message,
        body: lineItems(rows) + button(`${APP_URL}${rendered.actionUrl || '/bookings'}`, t(locale, 'View Booking', 'Lihat Tempahan')),
        locale,
      }),
      text: `${rendered.title}\n\n${rendered.message}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}`,
    };
  },

  payment_successful: ({ rendered, data, locale }) => {
    const rows = [
      [t(locale, 'Service', 'Perkhidmatan'), data.serviceName || '—'],
      [t(locale, 'Reference', 'Rujukan'), data.ref || '—'],
    ];
    return {
      subject: rendered.emailSubject,
      html: layout({
        title: t(locale, 'Payment received', 'Pembayaran diterima'),
        intro: rendered.message,
        body: lineItems(rows)
          + amountRow(t(locale, 'Amount paid', 'Jumlah dibayar'), data.amount || '—')
          + infoBox(t(
            locale,
            'Your funds are held securely and released to your professional once the service is complete.',
            'Dana anda disimpan dengan selamat dan dilepaskan kepada profesional anda setelah perkhidmatan selesai.',
          ))
          + button(`${APP_URL}${rendered.actionUrl || '/bookings'}`, t(locale, 'View Invoice', 'Lihat Invois')),
        locale,
      }),
      text: `${rendered.title}\n\n${rendered.message}`,
    };
  },

  cash_payment_recorded: ({ rendered, data, locale }) => ({
    subject: rendered.emailSubject,
    html: layout({
      title: t(locale, 'Cash payment recorded', 'Pembayaran tunai direkodkan'),
      intro: rendered.message,
      body: amountRow(t(locale, 'Amount', 'Jumlah'), data.amount || '—')
        + button(`${APP_URL}${rendered.actionUrl || '/bookings'}`, t(locale, 'View Receipt', 'Lihat Resit')),
      locale,
    }),
    text: `${rendered.title}\n\n${rendered.message}`,
  }),

  invoice_generated: ({ rendered, data, locale }) => ({
    subject: rendered.emailSubject,
    html: layout({
      title: t(locale, 'Your tax invoice', 'Invois cukai anda'),
      intro: rendered.message,
      body: infoBox(t(
        locale,
        'Your invoice itemises the service amount and SST separately, and carries our SST registration number.',
        'Invois anda memaparkan jumlah perkhidmatan dan SST secara berasingan, serta nombor pendaftaran SST kami.',
      )) + button(`${APP_URL}${rendered.actionUrl || '/bookings'}`, t(locale, 'View Invoice', 'Lihat Invois')),
      locale,
    }),
    text: `${rendered.title}\n\n${rendered.message}`,
  }),

  refund_completed: ({ rendered, data, locale }) => ({
    subject: rendered.emailSubject,
    html: layout({
      title: t(locale, 'Your refund is complete', 'Bayaran balik anda selesai'),
      intro: rendered.message,
      body: amountRow(t(locale, 'Refunded', 'Dibayar balik'), data.amount || '—')
        + infoBox(t(
          locale,
          'Funds usually take 3–10 working days to appear, depending on your bank or card issuer.',
          'Dana biasanya mengambil masa 3–10 hari bekerja untuk muncul, bergantung pada bank atau pengeluar kad anda.',
        )),
      locale,
    }),
    text: `${rendered.title}\n\n${rendered.message}`,
  }),

  booking_cancelled: ({ rendered, data, locale }) => ({
    subject: rendered.emailSubject,
    html: layout({
      title: t(locale, 'Your booking was cancelled', 'Tempahan anda dibatalkan'),
      intro: rendered.message,
      body: lineItems([
        [t(locale, 'Service', 'Perkhidmatan'), data.serviceName || '—'],
        [t(locale, 'Reference', 'Rujukan'), data.ref || '—'],
      ]) + button(`${APP_URL}/catalog`, t(locale, 'Book Again', 'Tempah Semula')),
      locale,
    }),
    text: `${rendered.title}\n\n${rendered.message}`,
  }),

  professional_assigned: ({ rendered, data, locale }) => ({
    subject: rendered.emailSubject,
    html: layout({
      title: t(locale, 'Your professional is assigned', 'Profesional anda ditugaskan'),
      intro: rendered.message,
      body: lineItems([
        [t(locale, 'Professional', 'Profesional'), data.partnerName || '—'],
        [t(locale, 'Service', 'Perkhidmatan'), data.serviceName || '—'],
        [t(locale, 'Date', 'Tarikh'), data.date || '—'],
      ]) + button(`${APP_URL}${rendered.actionUrl || '/bookings'}`, t(locale, 'View Booking', 'Lihat Tempahan')),
      locale,
    }),
    text: `${rendered.title}\n\n${rendered.message}`,
  }),

  payout_completed: ({ rendered, data, locale }) => ({
    subject: rendered.emailSubject,
    html: layout({
      title: t(locale, 'Your payout is on its way', 'Bayaran anda dalam perjalanan'),
      intro: rendered.message,
      body: amountRow(t(locale, 'Payout', 'Bayaran'), data.amount || '—')
        + infoBox(t(
          locale,
          'Funds usually reach your bank within 1–3 working days.',
          'Dana biasanya sampai ke bank anda dalam masa 1–3 hari bekerja.',
        )) + button(`${APP_URL}/partner/earnings`, t(locale, 'View Earnings', 'Lihat Pendapatan')),
      locale,
    }),
    text: `${rendered.title}\n\n${rendered.message}`,
  }),

  settlement_generated: ({ rendered, data, locale }) => ({
    subject: rendered.emailSubject,
    html: layout({
      title: t(locale, 'Commission settlement ready', 'Penyelesaian komisen sedia'),
      intro: rendered.message,
      body: lineItems([
        [t(locale, 'Reference', 'Rujukan'), data.reference || '—'],
        [t(locale, 'Due by', 'Tarikh akhir'), data.when || '—'],
      ])
        + amountRow(t(locale, 'Amount due', 'Jumlah perlu dibayar'), data.amount || '—')
        + button(`${APP_URL}/partner/wallet`, t(locale, 'Settle Now', 'Selesaikan Sekarang')),
      locale,
    }),
    text: `${rendered.title}\n\n${rendered.message}`,
  }),

  commission_overdue: ({ rendered, data, locale }) => ({
    subject: rendered.emailSubject,
    html: layout({
      title: t(locale, 'Your commission is overdue', 'Komisen anda tertunggak'),
      intro: rendered.message,
      body: amountRow(t(locale, 'Outstanding', 'Tertunggak'), data.amount || '—')
        + infoBox(t(
          locale,
          'New job offers pause after 7 days overdue, and payouts after 14. Jobs you have already accepted are not affected.',
          'Tawaran kerja baharu dihentikan selepas 7 hari tertunggak, dan bayaran selepas 14 hari. Kerja yang telah anda terima tidak terjejas.',
        ), 'warning')
        + button(`${APP_URL}/partner/wallet`, t(locale, 'Settle Now', 'Selesaikan Sekarang')),
      locale,
    }),
    text: `${rendered.title}\n\n${rendered.message}`,
  }),

  support_ticket_created: ({ rendered, data, locale }) => ({
    subject: rendered.emailSubject,
    html: layout({
      title: t(locale, 'We received your request', 'Kami menerima permintaan anda'),
      intro: rendered.message,
      body: lineItems([[t(locale, 'Ticket', 'Tiket'), data.ticketRef || '—']])
        + button(`${APP_URL}/support`, t(locale, 'View Ticket', 'Lihat Tiket')),
      locale,
    }),
    text: `${rendered.title}\n\n${rendered.message}`,
  }),

  damage_claim_submitted: ({ rendered, data, locale }) => ({
    subject: rendered.emailSubject,
    html: layout({
      title: t(locale, 'We received your damage claim', 'Kami menerima tuntutan kerosakan anda'),
      intro: rendered.message,
      body: lineItems([
        [t(locale, 'Claim', 'Tuntutan'), data.reference || '—'],
        [t(locale, 'Amount claimed', 'Jumlah dituntut'), data.amount || '—'],
      ])
        + infoBox(t(
          locale,
          'We acknowledge every claim within 24 hours and aim to complete the investigation within 7 days.',
          'Kami mengakui setiap tuntutan dalam masa 24 jam dan menyasarkan siasatan selesai dalam masa 7 hari.',
        )),
      locale,
    }),
    text: `${rendered.title}\n\n${rendered.message}`,
  }),
};

/**
 * Render an email for a notification event.
 *
 * @param {object} rendered  the catalog-rendered notification
 * @param {object} data      metadata (serviceName, amount, ref, …)
 * @param {object} [opts]    { locale }
 * @returns {{ subject, html, text }}
 */
export function renderTemplate(rendered, data = {}, { locale = 'en' } = {}) {
  const builder = TEMPLATES[rendered.event];
  if (builder) {
    try {
      return builder({ rendered, data, locale });
    } catch (err) {
      // A broken template must not stop the email — fall through to generic.
      console.error(`[email] template ${rendered.event} failed, using fallback:`, err?.message || err);
    }
  }
  return genericTemplate(rendered, locale);
}

/** The original generic layout, kept as the fallback for uncovered events. */
function genericTemplate(rendered, locale = 'en') {
  return {
    subject: rendered.emailSubject || 'ServisAku',
    html: layout({
      title: rendered.title,
      intro: rendered.message,
      body: rendered.actionUrl
        ? button(`${APP_URL}${rendered.actionUrl.startsWith('/') ? rendered.actionUrl : `/${rendered.actionUrl}`}`,
          rendered.ctaLabel || t(locale, 'Open ServisAku', 'Buka ServisAku'))
        : '',
      locale,
    }),
    text: `${rendered.title}\n\n${rendered.message}`,
  };
}

export function hasTemplate(event) {
  return Object.prototype.hasOwnProperty.call(TEMPLATES, event);
}

export function templateKeys() {
  return Object.keys(TEMPLATES);
}

export { escapeHtml };
