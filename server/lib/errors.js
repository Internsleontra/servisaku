// ─────────────────────────────────────────────────────────────────────────────
// Localized customer-facing API errors.
//
// Reuses server/lib/locale.js for resolution — this module owns message text,
// never locale parsing.
//
// WHAT BELONGS HERE
//   Business-rule failures a customer can reach by using the app normally:
//   cancelling too late, disputing someone else's booking, claiming twice.
//
//   Plus the generic access guards a customer genuinely lands on — a stale
//   link, a shared URL, a booking that has since changed hands all produce a
//   403/404 in front of a customer, so those are localized too.
//
// WHAT DOES NOT
//   · role gates a customer can never trip ("Partners only", "Support staff
//     only") — reaching one means a client bug, and English is easier to find
//     in a report
//   · API-contract violations ("token is required") — the shipped UI cannot
//     produce them; they signal a client bug
//   · partner-only rules — partner localization has not started
//   · admin/back-office rules — no customer surface
//
// CONTRACT
//   `code` is stable, English, and never shown to a customer. It travels in the
//   additive `details` array so a client can branch on it instead of parsing
//   prose. HTTP status is chosen by the caller and unchanged by localization.
//
// REVIEW BEFORE PRODUCTION: machine-authored translations, no native-speaker
// review. Several carry refund, dispute, liability or payment meaning.
// ─────────────────────────────────────────────────────────────────────────────
import { ApiError } from './apiError.js';

/* Each entry: code → { en, ms }. Both sides take the same arguments in the same
   order; Malay decides where they land in the sentence. */
const MESSAGES = {
  // ── Access ───────────────────────────────────────────────────────────────
  // Deliberately vague in both languages: a customer who reaches someone
  // else's booking should not learn whether it exists.
  forbidden: {
    en: () => 'You do not have access to this',
    ms: () => 'Anda tiada akses kepada ini',
  },
  not_found: {
    en: () => 'Not found',
    ms: () => 'Tidak dijumpai',
  },

  // ── Catalogue ────────────────────────────────────────────────────────────
  service_not_found: {
    en: (id) => `Service not found: ${id}`,
    ms: (id) => `Perkhidmatan tidak dijumpai: ${id}`,
  },
  category_not_found: {
    en: (slug) => `Category not found: ${slug}`,
    ms: (slug) => `Kategori tidak dijumpai: ${slug}`,
  },
  unknown_service: {
    en: (id) => `Unknown service: ${id}`,
    ms: (id) => `Perkhidmatan tidak dikenali: ${id}`,
  },
  not_dynamic_service: {
    en: (slug) => `Service "${slug}" is not a dynamic-engine service`,
    ms: (slug) => `Perkhidmatan "${slug}" tidak menggunakan enjin harga dinamik`,
  },
  // The size, package and addon ids below are stored keys, not labels — they
  // stay in English so support and the client can still match them.
  unknown_property_size: {
    en: (sizeId, slug) => `Unknown property size "${sizeId}" for ${slug}`,
    ms: (sizeId, slug) => `Saiz hartanah "${sizeId}" tidak dikenali untuk ${slug}`,
  },
  unknown_package: {
    en: (pkg, slug) => `Unknown package "${pkg}" for service "${slug}"`,
    ms: (pkg, slug) => `Pakej "${pkg}" tidak dikenali untuk perkhidmatan "${slug}"`,
  },
  unknown_addon: {
    en: (addon, slug) => `Unknown addon "${addon}" for service "${slug}"`,
    ms: (addon, slug) => `Perkhidmatan tambahan "${addon}" tidak dikenali untuk "${slug}"`,
  },

  // ── Booking lifecycle ────────────────────────────────────────────────────
  booking_not_found: {
    en: () => 'Booking not found',
    ms: () => 'Tempahan tidak dijumpai',
  },
  partner_unavailable: {
    en: () => 'Selected partner is not available',
    ms: () => 'Rakan kongsi yang dipilih tidak tersedia',
  },
  partner_not_qualified: {
    en: () => 'Selected partner is not qualified for this service',
    ms: () => 'Rakan kongsi yang dipilih tidak layak untuk perkhidmatan ini',
  },
  partner_not_found: {
    en: () => 'Partner not found',
    ms: () => 'Rakan kongsi tidak dijumpai',
  },
  only_customer_confirms: {
    en: () => 'Only the customer can confirm completion',
    ms: () => 'Hanya pelanggan boleh mengesahkan kerja selesai',
  },
  cannot_confirm_status: {
    en: (status) => `Cannot confirm a booking that is "${status}"`,
    ms: (status) => `Tempahan berstatus "${status}" tidak boleh disahkan`,
  },
  invalid_status_change: {
    en: (from, to) => `Cannot change status from "${from}" to "${to}"`,
    ms: (from, to) => `Status tidak boleh ditukar daripada "${from}" kepada "${to}"`,
  },
  only_customer_decides_extras: {
    en: () => 'Only the customer can approve or reject extras',
    ms: () => 'Hanya pelanggan boleh meluluskan atau menolak perkhidmatan tambahan',
  },
  extra_not_found: {
    en: () => 'Extra not found',
    ms: () => 'Perkhidmatan tambahan tidak dijumpai',
  },
  extra_already_decided: {
    en: () => 'This extra has already been decided',
    ms: () => 'Perkhidmatan tambahan ini telah pun diputuskan',
  },
  status_not_allowed: {
    en: (status) => `You are not allowed to set status "${status}"`,
    ms: (status) => `Anda tidak dibenarkan menetapkan status "${status}"`,
  },
  no_permitted_fields: {
    en: () => 'No permitted fields to update',
    ms: () => 'Tiada medan yang dibenarkan untuk dikemas kini',
  },

  // ── Payments ─────────────────────────────────────────────────────────────
  cash_not_via_checkout: {
    en: () => 'Cash payments are recorded at completion, not through checkout',
    ms: () => 'Bayaran tunai direkodkan setelah kerja selesai, bukan melalui pembayaran dalam talian',
  },
  payment_method_unavailable: {
    en: (method) => `Payment method "${method}" is not available. Configure a provider that supports it.`,
    ms: (method) => `Kaedah pembayaran "${method}" tidak tersedia. Sila pilih kaedah lain.`,
  },
  booking_already_paid: {
    en: () => 'This booking is already paid',
    ms: () => 'Tempahan ini telah pun dibayar',
  },
  payment_not_found: {
    en: () => 'Payment not found',
    ms: () => 'Pembayaran tidak dijumpai',
  },
  // The provider's own text is kept verbatim after the colon — it is what
  // support quotes back to the gateway — but the sentence around it is ours.
  payment_gateway_error: {
    en: (detail) => `Gateway error: ${detail}`,
    ms: (detail) => `Ralat pintu pembayaran: ${detail}`,
  },

  // ── Refunds ──────────────────────────────────────────────────────────────
  refund_own_bookings_only: {
    en: () => 'You can only request refunds for your own bookings',
    ms: () => 'Anda hanya boleh meminta bayaran balik untuk tempahan anda sendiri',
  },
  refund_already_exists: {
    en: () => 'A refund request already exists for this booking',
    ms: () => 'Permintaan bayaran balik untuk tempahan ini telah pun wujud',
  },
  refund_not_found: {
    en: () => 'Refund request not found',
    ms: () => 'Permintaan bayaran balik tidak dijumpai',
  },
  refund_cannot_cancel: {
    en: (status) => `A ${status} refund cannot be cancelled`,
    ms: (status) => `Bayaran balik berstatus ${status} tidak boleh dibatalkan`,
  },

  // ── Disputes ─────────────────────────────────────────────────────────────
  dispute_not_found: {
    en: () => 'Dispute not found',
    ms: () => 'Pertikaian tidak dijumpai',
  },
  dispute_own_bookings_only: {
    en: () => 'You can only dispute your own bookings',
    ms: () => 'Anda hanya boleh membuat pertikaian untuk tempahan anda sendiri',
  },
  dispute_too_early: {
    en: () => 'A dispute can only be raised once the service has started or finished',
    ms: () => 'Pertikaian hanya boleh dibuat setelah perkhidmatan bermula atau selesai',
  },
  dispute_already_open: {
    en: () => 'An open dispute already exists for this booking',
    ms: () => 'Pertikaian yang masih terbuka telah pun wujud untuk tempahan ini',
  },
  dispute_self_response: {
    en: () => 'You raised this dispute — add evidence instead of responding to yourself',
    ms: () => 'Anda yang membuat pertikaian ini — tambah bukti dan bukannya membalas diri sendiri',
  },
  dispute_closed: {
    en: () => 'This dispute is already closed',
    ms: () => 'Pertikaian ini telah pun ditutup',
  },

  // ── Damage claims ────────────────────────────────────────────────────────
  claim_not_found: {
    en: () => 'Damage claim not found',
    ms: () => 'Tuntutan kerosakan tidak dijumpai',
  },
  claim_own_bookings_only: {
    en: () => 'You can only claim on your own bookings',
    ms: () => 'Anda hanya boleh membuat tuntutan untuk tempahan anda sendiri',
  },
  claim_before_completion: {
    en: () => 'A damage claim can only be filed after the job is completed',
    ms: () => 'Tuntutan kerosakan hanya boleh difailkan setelah kerja selesai',
  },
  claim_already_open: {
    en: () => 'An open claim already exists for this booking — add evidence to it instead',
    ms: () => 'Tuntutan yang masih terbuka telah pun wujud untuk tempahan ini — tambah bukti kepadanya',
  },
  claim_photo_required: {
    en: () => 'At least one photo of the damage is required',
    ms: () => 'Sekurang-kurangnya satu gambar kerosakan diperlukan',
  },
  claim_evidence_after_decision: {
    en: () => 'Evidence cannot be added after a decision has been made',
    ms: () => 'Bukti tidak boleh ditambah selepas keputusan dibuat',
  },
  claim_already_decided: {
    en: () => 'This claim has already been decided',
    ms: () => 'Tuntutan ini telah pun diputuskan',
  },
  claim_appeal_owner_only: {
    en: () => 'Only the claimant can appeal',
    ms: () => 'Hanya pembuat tuntutan boleh membuat rayuan',
  },
  claim_no_decision_yet: {
    en: () => 'There is no decision to appeal yet',
    ms: () => 'Belum ada keputusan untuk dirayu',
  },
  claim_already_appealed: {
    en: () => 'This claim has already been appealed once — the decision is final',
    ms: () => 'Tuntutan ini telah pun dirayu sekali — keputusan adalah muktamad',
  },

  // ── Reviews ──────────────────────────────────────────────────────────────
  review_not_found: {
    en: () => 'Review not found',
    ms: () => 'Ulasan tidak dijumpai',
  },
  review_own_bookings_only: {
    en: () => 'You can only review your own bookings',
    ms: () => 'Anda hanya boleh mengulas tempahan anda sendiri',
  },
  review_completed_only: {
    en: () => 'You can only review completed bookings',
    ms: () => 'Anda hanya boleh mengulas tempahan yang telah selesai',
  },
  review_already_exists: {
    en: () => 'This booking has already been reviewed',
    ms: () => 'Tempahan ini telah pun diulas',
  },

  // ── Support ──────────────────────────────────────────────────────────────
  ticket_not_found: {
    en: () => 'Ticket not found',
    ms: () => 'Tiket tidak dijumpai',
  },
  ticket_limit_reached: {
    en: (max) => `You already have ${max} open tickets — please continue in one of those`,
    ms: (max) => `Anda sudah mempunyai ${max} tiket terbuka — sila teruskan dalam salah satu daripadanya`,
  },
  ticket_reopen_owner_only: {
    en: () => 'Only the ticket owner can reopen it',
    ms: () => 'Hanya pemilik tiket boleh membukanya semula',
  },
  ticket_reopen_limit: {
    en: (days) => `This ticket can no longer be reopened (limit ${days} days and 3 reopens) — please raise a new one`,
    ms: (days) => `Tiket ini tidak boleh dibuka semula (had ${days} hari dan 3 kali) — sila buka tiket baharu`,
  },
  ticket_rate_owner_only: {
    en: () => 'Only the ticket owner can rate it',
    ms: () => 'Hanya pemilik tiket boleh memberi penilaian',
  },
  ticket_already_rated: {
    en: () => 'You have already rated this ticket',
    ms: () => 'Anda telah pun menilai tiket ini',
  },
  ticket_rate_after_resolved: {
    en: () => 'Rate the ticket once it has been resolved',
    ms: () => 'Nilai tiket setelah ia diselesaikan',
  },
  callback_window_order: {
    en: () => 'The end of the window must be after its start',
    ms: () => 'Waktu tamat mestilah selepas waktu mula',
  },
  callback_window_past: {
    en: () => 'Pick a window in the future',
    ms: () => 'Sila pilih waktu pada masa hadapan',
  },
  callback_window_too_far: {
    en: (days) => `Callbacks can be scheduled up to ${days} days ahead`,
    ms: (days) => `Panggilan balik boleh dijadualkan sehingga ${days} hari lebih awal`,
  },

  // ── Help centre & legal (both served unauthenticated to the public site) ──
  article_not_found: {
    en: () => 'Article not found',
    ms: () => 'Artikel tidak dijumpai',
  },
  legal_document_unknown: {
    en: () => 'Unknown document',
    ms: () => 'Dokumen tidak dikenali',
  },
  legal_document_unpublished: {
    en: () => 'This document has not been published yet',
    ms: () => 'Dokumen ini belum diterbitkan',
  },
  // Field-level causes stay in English after the colon for the same reason the
  // zod details do — they name field ids, not prose a customer reads.
  invalid_service_details: {
    en: (detail) => `Invalid service details: ${detail}`,
    ms: (detail) => `Butiran perkhidmatan tidak sah: ${detail}`,
  },

  // ── Invoices ─────────────────────────────────────────────────────────────
  invoice_not_found: {
    en: () => 'Invoice not found',
    ms: () => 'Invois tidak dijumpai',
  },

  // ── Coupons (legacy pricing engine) ──────────────────────────────────────
  coupon_invalid: {
    en: () => 'Invalid coupon',
    ms: () => 'Kupon tidak sah',
  },
  coupon_expired: {
    en: () => 'Coupon expired',
    ms: () => 'Kupon telah tamat tempoh',
  },
  coupon_usage_limit: {
    en: () => 'Coupon usage limit reached',
    ms: () => 'Had penggunaan kupon telah dicapai',
  },
  coupon_min_order: {
    en: (amount) => `Coupon requires a minimum order of RM${amount}`,
    ms: (amount) => `Kupon memerlukan pesanan minimum RM${amount}`,
  },
  coupon_wrong_service: {
    en: () => 'Coupon not valid for this service',
    ms: () => 'Kupon tidak sah untuk perkhidmatan ini',
  },
};

/**
 * Build a localized ApiError.
 * @param {number} status HTTP status — unchanged by localization
 * @param {keyof MESSAGES} code stable, English, never shown to a customer
 * @param {'en'|'ms'} locale unknown values fall back to English
 * @param {...any} args interpolated into both language variants
 */
export function localizedError(status, code, locale, ...args) {
  const set = MESSAGES[code];
  if (!set) {
    // An unknown code must not produce a blank customer message.
    return new ApiError(status, code, [{ code }]);
  }
  const fn = set[locale === 'ms' ? 'ms' : 'en'] || set.en;
  return new ApiError(status, fn(...args), [
    { code, ...(args.length ? { values: args } : {}) },
  ]);
}

/** Message text without throwing — used by tests and the validator. */
export function localizedMessage(code, locale, ...args) {
  const set = MESSAGES[code];
  if (!set) return code;
  return (set[locale === 'ms' ? 'ms' : 'en'] || set.en)(...args);
}

/* ── Refund policy explanations ──────────────────────────────────────────────
   The refund engine (lib/refunds/policy.js) stays pure and English: it returns a
   stable `policy` code alongside its prose. Only the prose is localized, and
   only here, at the presentation seam — no amount, percentage or eligibility
   decision depends on language.

   REVIEW BEFORE PRODUCTION: this is refund policy wording. A mistranslated
   notice period or percentage is a commercial commitment, not a typo. */
const REFUND_POLICY_REASONS = {
  cancel_gt_48h: {
    en: "Full refund — more than 48 hours' notice",
    ms: 'Bayaran balik penuh — notis lebih daripada 48 jam',
  },
  cancel_4_to_48h: {
    en: "75% refund — 4 to 48 hours' notice",
    ms: 'Bayaran balik 75% — notis antara 4 hingga 48 jam',
  },
  cancel_lt_4h: {
    en: "50% refund — less than 4 hours' notice",
    ms: 'Bayaran balik 50% — notis kurang daripada 4 jam',
  },
  partner_accepted: {
    en: '50% refund — a professional had already accepted',
    ms: 'Bayaran balik 50% — seorang profesional telah pun menerima tempahan',
  },
  partner_no_show: {
    en: 'Full refund — the professional did not attend',
    ms: 'Bayaran balik penuh — profesional tidak hadir',
  },
  dispute_pending: {
    en: 'Full refund pending dispute review',
    ms: 'Bayaran balik penuh tertakluk kepada semakan pertikaian',
  },
  not_eligible: {
    en: 'Not eligible for an automatic refund at this stage — please raise a dispute',
    ms: 'Tidak layak untuk bayaran balik automatik pada peringkat ini — sila buat pertikaian',
  },
  already_refunded: {
    en: 'This booking has already been fully refunded',
    ms: 'Tempahan ini telah pun dibayar balik sepenuhnya',
  },
};

/**
 * Localized explanation for a refund policy verdict.
 * Falls back to the engine's own English prose for a policy code that has no
 * entry, so a new policy can never render blank.
 */
export function refundPolicyReason(policy, locale, fallback) {
  const set = REFUND_POLICY_REASONS[policy];
  if (!set) return fallback || policy;
  return set[locale === 'ms' ? 'ms' : 'en'] || set.en;
}

export const REFUND_POLICY_CODES = Object.keys(REFUND_POLICY_REASONS);

export const ERROR_CODES = Object.keys(MESSAGES);
export { MESSAGES as ERROR_MESSAGES };
