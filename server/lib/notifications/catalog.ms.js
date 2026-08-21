// ─────────────────────────────────────────────────────────────────────────────
// Malay strings for the notification catalog.
//
// STRINGS ONLY. Every piece of behaviour — category, priority, icon, role,
// channels, actionUrl, ctaLabel, and whether an event is email- or sms-worthy —
// stays in catalog.js and is never repeated here. This file answers exactly one
// question: "what does this event say in Malay?"
//
// Keyed by the same event names, with the same shapes catalog.js uses:
//   string            a fixed line
//   (data) => string  interpolated, mirroring the English logic and its
//                     fallbacks so a missing field degrades the same way
//
// An event missing from this map falls back to English rather than rendering
// blank — see renderEvent().
//
// REVIEW BEFORE PRODUCTION: these are machine-authored translations with no
// native-speaker review. Several carry financial or account-security meaning
// (commission, settlement, payout, refund deduction, suspicious login) where a
// wrong nuance is more costly than an awkward one.
// ─────────────────────────────────────────────────────────────────────────────

export const CATALOG_MS = {
  // ── Consumer: booking lifecycle ───────────────────────────────────────────
  booking_created: {
    title: 'Tempahan diterima',
    message: (d) => `Permintaan ${d.serviceName || 'perkhidmatan'} anda telah diterima. Kami sedang mencari profesional untuk anda.`,
  },
  booking_confirmed: {
    title: 'Tempahan disahkan',
    message: (d) => `${d.serviceName || 'Perkhidmatan'} anda disahkan untuk ${d.date || 'tarikh pilihan anda'}${d.timeSlot ? ` pada ${d.timeSlot}` : ''}.`,
  },
  booking_pending: {
    title: 'Menunggu pengesahan',
    message: (d) => `Kami sedang memadankan ${d.serviceName || 'perkhidmatan'} anda dengan profesional yang tersedia.`,
  },
  booking_accepted: {
    title: 'Seorang profesional menerima tempahan anda',
    message: (d) => `${d.partnerName || 'Seorang profesional'} telah menerima permintaan ${d.serviceName || 'perkhidmatan'} anda.`,
  },
  professional_assigned: {
    title: 'Profesional ditugaskan',
    message: (d) => `${d.partnerName || 'Profesional anda'} telah ditugaskan untuk ${d.serviceName || 'perkhidmatan'} anda.`,
  },
  professional_on_the_way: {
    title: 'Profesional anda dalam perjalanan',
    message: (d) => `${d.partnerName || 'Profesional anda'} sedang menuju ke lokasi anda${d.eta ? ` — anggaran tiba ${d.eta}` : ''}.`,
  },
  professional_arrived: {
    title: 'Profesional anda telah tiba',
    message: (d) => `${d.partnerName || 'Profesional anda'} telah tiba di lokasi anda.`,
  },
  otp_generated: {
    title: 'Kod mula perkhidmatan anda',
    message: (d) => `Kongsi kod ${d.otp || '••••'} dengan ${d.partnerName || 'profesional anda'} untuk memulakan perkhidmatan.`,
  },
  otp_verified: {
    title: 'Kod perkhidmatan disahkan',
    message: 'Kod mula anda telah disahkan. Perkhidmatan sedang bermula.',
  },
  service_started: {
    title: 'Perkhidmatan bermula',
    message: (d) => `${d.serviceName || 'Perkhidmatan'} anda kini sedang dijalankan.`,
  },
  service_completed: {
    title: 'Perkhidmatan selesai',
    message: (d) => `${d.serviceName || 'Perkhidmatan'} anda telah selesai. Semoga anda berpuas hati!`,
  },
  booking_cancelled: {
    title: 'Tempahan dibatalkan',
    message: (d) => `Tempahan ${d.serviceName || 'perkhidmatan'} anda (${d.ref || ''}) telah dibatalkan.`,
  },
  booking_rescheduled: {
    title: 'Tempahan dijadualkan semula',
    message: (d) => `${d.serviceName || 'Perkhidmatan'} anda kini dijadualkan pada ${d.date || ''}${d.timeSlot ? ` pukul ${d.timeSlot}` : ''}.`,
  },
  booking_reminder: {
    title: 'Peringatan perkhidmatan akan datang',
    message: (d) => `Peringatan: ${d.serviceName || 'perkhidmatan'} anda ${d.when || 'akan berlangsung tidak lama lagi'}${d.timeSlot ? ` pada ${d.timeSlot}` : ''}.`,
  },
  booking_expired: {
    title: 'Permintaan tempahan tamat tempoh',
    message: (d) => `Permintaan ${d.serviceName || 'perkhidmatan'} anda tamat tempoh tanpa padanan. Sila cuba lagi.`,
  },

  // ── Consumer: payments, refunds, disputes ─────────────────────────────────
  payment_initiated: {
    title: 'Pembayaran dimulakan',
    message: (d) => `Kami sedang memproses pembayaran anda${d.amount ? ` sebanyak ${d.amount}` : ''}.`,
  },
  payment_successful: {
    title: 'Pembayaran berjaya',
    message: (d) => `Pembayaran anda${d.amount ? ` sebanyak ${d.amount}` : ''} telah berjaya. Terima kasih!`,
  },
  payment_failed: {
    title: 'Pembayaran gagal',
    message: (d) => `Pembayaran anda${d.amount ? ` sebanyak ${d.amount}` : ''} tidak dapat diproses. Sila cuba lagi.`,
  },
  refund_initiated: {
    title: 'Bayaran balik dimulakan',
    message: (d) => `Bayaran balik${d.amount ? ` sebanyak ${d.amount}` : ''} sedang diproses ke kaedah pembayaran asal anda.`,
  },
  refund_completed: {
    title: 'Bayaran balik selesai',
    message: (d) => `Bayaran balik anda${d.amount ? ` sebanyak ${d.amount}` : ''} telah selesai.`,
  },
  refund_requested: {
    title: 'Permintaan bayaran balik diterima',
    message: (d) => `Kami telah menerima permintaan bayaran balik anda${d.amount ? ` sebanyak ${d.amount}` : ''} dan akan menyemaknya sebentar lagi.`,
  },
  refund_approved: {
    title: 'Bayaran balik diluluskan',
    message: (d) => `Bayaran balik anda${d.amount ? ` sebanyak ${d.amount}` : ''} telah diluluskan dan sedang diproses.`,
  },
  refund_rejected: {
    title: 'Permintaan bayaran balik ditolak',
    message: (d) => `Permintaan bayaran balik anda telah ditolak${d.reason ? `: ${d.reason}` : ''}. Anda boleh membuat pertikaian jika tidak bersetuju.`,
  },
  refund_failed: {
    title: 'Bayaran balik tidak dapat diproses',
    message: (d) => `Kami tidak dapat memproses bayaran balik anda${d.amount ? ` sebanyak ${d.amount}` : ''}. Pasukan kami telah dimaklumkan dan akan menyelesaikannya.`,
  },
  dispute_raised: {
    title: 'Pertikaian dibuka',
    message: (d) => `Pertikaian anda ${d.reference || ''} telah dibuka. Kami akan menyiasat dan menghubungi anda semula.`,
  },
  dispute_response_needed: {
    title: 'Beri maklum balas kepada pertikaian',
    message: (d) => `Satu pertikaian telah dibuat terhadap ${d.serviceName || 'satu kerja'} (${d.reference || ''}). Sila berikan penjelasan anda tentang apa yang berlaku.`,
  },
  dispute_resolved: {
    title: 'Pertikaian diselesaikan',
    message: (d) => `Pertikaian ${d.reference || ''} telah diselesaikan${d.outcome ? ` — ${d.outcome}` : ''}.`,
  },
  partner_liability_applied: {
    title: 'Potongan bayaran balik dikenakan',
    message: (d) => `${d.amount || 'Satu potongan'} telah dikenakan pada dompet anda untuk bayaran balik bagi ${d.serviceName || 'satu kerja'}.`,
  },

  // ── Consumer: damage claims ───────────────────────────────────────────────
  damage_claim_submitted: {
    title: 'Tuntutan kerosakan diterima',
    message: (d) => `Tuntutan anda ${d.reference || ''}${d.amount ? ` sebanyak ${d.amount}` : ''} telah diterima. Kami akan mengesahkannya dalam masa 24 jam.`,
  },
  damage_claim_acknowledged: {
    title: 'Tuntutan sedang disiasat',
    message: (d) => `Kami telah mula menyiasat tuntutan ${d.reference || ''}.`,
  },
  damage_response_required: {
    title: 'Tuntutan kerosakan memerlukan maklum balas anda',
    message: (d) => `Satu tuntutan kerosakan (${d.reference || ''}) telah difailkan terhadap ${d.serviceName || 'satu kerja'}${d.item ? ` berkenaan ${d.item}` : ''}. Anda perlu memberi maklum balas.`,
  },
  damage_evidence_requested: {
    title: 'Bukti tambahan diperlukan',
    message: (d) => `Kami memerlukan bukti tambahan untuk meneruskan tuntutan ${d.reference || ''}.`,
  },
  damage_claim_approved: {
    title: 'Tuntutan kerosakan diluluskan',
    message: (d) => `Tuntutan ${d.reference || ''} telah diluluskan${d.amount ? ` sebanyak ${d.amount}` : ''}. Pampasan akan menyusul sebentar lagi.`,
  },
  damage_claim_rejected: {
    title: 'Tuntutan kerosakan ditolak',
    message: (d) => `Tuntutan ${d.reference || ''} telah ditolak${d.reason ? `: ${d.reason}` : ''}. Anda boleh membuat rayuan sekali.`,
  },
  damage_compensation_sent: {
    title: 'Pampasan dihantar',
    message: (d) => `${d.amount || 'Pampasan anda'} telah dihantar${d.method ? ` melalui ${d.method}` : ''}.`,
  },
  damage_liability_applied: {
    title: 'Potongan kerosakan dikenakan',
    message: (d) => `${d.amount || 'Satu potongan'} telah dikenakan pada dompet anda untuk tuntutan kerosakan ${d.reference || ''}.`,
  },

  // ── Consumer: invoices, wallet, coupons, cash ─────────────────────────────
  invoice_generated: {
    title: 'Invois sedia',
    message: (d) => `Invois anda untuk ${d.serviceName || 'perkhidmatan anda'} sedia untuk dilihat.`,
  },
  wallet_cashback_added: {
    title: 'Pulangan tunai ditambah',
    message: (d) => `${d.amount || 'Pulangan tunai'} telah ditambah ke dompet ServisAku anda.`,
  },
  coupon_applied: {
    title: 'Kupon digunakan',
    message: (d) => `Kupon ${d.code || ''} telah digunakan${d.amount ? ` — anda menjimatkan ${d.amount}` : ''}.`,
  },
  coupon_expiring: {
    title: 'Kupon akan tamat tempoh',
    message: (d) => `Kupon anda ${d.code || ''} tamat tempoh ${d.when || 'tidak lama lagi'}. Gunakannya sebelum terlepas!`,
  },
  payment_due_cash: {
    title: 'Bayaran perlu dijelaskan setelah selesai',
    message: (d) => `Sila bayar ${d.amount || 'profesional anda'} secara tunai untuk ${d.serviceName || 'perkhidmatan'} anda.`,
  },
  cash_payment_recorded: {
    title: 'Bayaran tunai direkodkan',
    message: (d) => `Kami telah merekodkan bayaran tunai anda${d.amount ? ` sebanyak ${d.amount}` : ''}. Resit anda sudah sedia.`,
  },

  // ── Consumer: reviews and support ─────────────────────────────────────────
  review_request: {
    title: 'Bagaimana perkhidmatan anda?',
    message: (d) => `Sila nilai ${d.serviceName || 'perkhidmatan terkini'} anda bersama ${d.partnerName || 'profesional anda'}.`,
  },
  review_thanks: {
    title: 'Terima kasih atas ulasan anda',
    message: 'Maklum balas anda membantu kami mengekalkan kualiti. Terima kasih!',
  },
  support_ticket_created: {
    title: 'Tiket sokongan dibuka',
    message: (d) => `Tiket sokongan anda ${d.ticketRef || ''} telah dibuka. Kami akan menghubungi anda tidak lama lagi.`,
  },
  support_reply: {
    title: 'Sokongan telah membalas',
    message: (d) => `Anda menerima balasan baharu pada tiket ${d.ticketRef || ''}.`,
  },
  support_ticket_closed: {
    title: 'Tiket sokongan ditutup',
    message: (d) => `Tiket sokongan anda ${d.ticketRef || ''} telah diselesaikan.`,
  },
  ticket_assigned: {
    title: 'Tiket ditugaskan kepada anda',
    message: (d) => `Tiket sokongan ${d.ticketRef || ''} telah ditugaskan kepada anda.`,
  },
  csat_request: {
    title: 'Bagaimana prestasi kami?',
    message: (d) => `Tiket anda ${d.ticketRef || ''} telah diselesaikan. Nilai sokongan yang anda terima.`,
  },
  callback_requested: {
    title: 'Panggilan balik diminta',
    message: (d) => `Kami akan menghubungi anda semula${d.when ? ` sekitar ${d.when}` : ' dalam tempoh pilihan anda'}.`,
  },
  callback_scheduled: {
    title: 'Panggilan balik dijadualkan',
    message: (d) => `Seorang ejen akan menghubungi anda${d.when ? ` pada ${d.when}` : ' sebentar lagi'}.`,
  },
  callback_completed: {
    title: 'Panggilan balik selesai',
    message: 'Terima kasih kerana berbual dengan kami. Beritahu kami jika ada apa-apa yang belum selesai.',
  },
  promo_offer: {
    title: (d) => d.title || 'Tawaran istimewa',
    message: (d) => d.body || 'Satu tawaran baharu sedang menanti anda.',
  },

  // ── Consumer: account security ────────────────────────────────────────────
  new_login: {
    title: 'Log masuk baharu dikesan',
    message: (d) => `Satu log masuk baharu telah dikesan${d.device ? ` dari ${d.device}` : ''}${d.location ? ` di ${d.location}` : ''}.`,
  },
  password_changed: {
    title: 'Kata laluan ditukar',
    message: 'Kata laluan akaun anda telah ditukar. Jika ini bukan anda, hubungi sokongan dengan segera.',
  },
  suspicious_login: {
    title: 'Log masuk mencurigakan disekat',
    message: (d) => `Kami telah menyekat percubaan log masuk yang mencurigakan${d.location ? ` dari ${d.location}` : ''}.`,
  },

  // ── Partner: jobs ─────────────────────────────────────────────────────────
  new_job_request: {
    title: 'Permintaan kerja baharu',
    message: (d) => `Satu ${d.serviceName || 'kerja'} baharu tersedia${d.area ? ` di ${d.area}` : ''}${d.payout ? ` — pendapatan ${d.payout}` : ''}.`,
  },
  job_assigned: {
    title: 'Kerja ditugaskan kepada anda',
    message: (d) => `Anda telah ditugaskan satu ${d.serviceName || 'kerja'}${d.date ? ` pada ${d.date}` : ''}.`,
  },
  job_cancelled: {
    title: 'Kerja dibatalkan',
    message: (d) => `${d.serviceName || 'Kerja'} (${d.ref || ''}) telah dibatalkan${d.by ? ` oleh ${d.by}` : ''}.`,
  },
  customer_rescheduled: {
    title: 'Pelanggan menukar jadual',
    message: (d) => `${d.customerName || 'Pelanggan'} telah menukar ${d.serviceName || 'kerja'} kepada ${d.date || ''}${d.timeSlot ? ` pukul ${d.timeSlot}` : ''}.`,
  },
  customer_arrived_flow: {
    title: 'Pelanggan sudah bersedia',
    message: (d) => `${d.customerName || 'Pelanggan'} sudah bersedia untuk anda mula.`,
  },
  customer_confirmed_completion: {
    title: 'Pelanggan mengesahkan kerja selesai',
    message: (d) => `${d.customerName || 'Pelanggan'} telah mengesahkan ${d.serviceName || 'kerja'} itu selesai.`,
  },

  // ── Partner: earnings, commission, payouts ────────────────────────────────
  payment_released: {
    title: 'Bayaran dilepaskan',
    message: (d) => `Pendapatan anda${d.amount ? ` sebanyak ${d.amount}` : ''} bagi ${d.serviceName || 'kerja yang telah selesai'} telah dilepaskan.`,
  },
  earnings_credited: {
    title: 'Pendapatan dikreditkan',
    message: (d) => `${d.amount || 'Pendapatan anda'} telah dikreditkan ke akaun anda.`,
  },
  weekly_earnings_summary: {
    title: 'Pendapatan mingguan anda',
    message: (d) => `Anda memperoleh ${d.amount || '—'} daripada ${d.jobs || 0} kerja minggu ini.`,
  },
  incentive_earned: {
    title: 'Insentif diperoleh',
    message: (d) => `Anda memperoleh insentif${d.amount ? ` sebanyak ${d.amount}` : ''}. Teruskan usaha!`,
  },
  cash_collected: {
    title: 'Bayaran tunai direkodkan',
    message: (d) => `Anda merekodkan ${d.amount || 'satu bayaran tunai'} untuk ${d.serviceName || 'kerja itu'}. Komisen sebanyak ${d.commission || '—'} telah dikenakan.`,
  },
  settlement_generated: {
    title: 'Penyelesaian komisen sedia',
    message: (d) => `Penyelesaian anda ${d.reference || ''} sebanyak ${d.amount || '—'} perlu dijelaskan sebelum ${d.when || 'tarikh akhir'}.`,
  },
  commission_due: {
    title: 'Bayaran komisen perlu dijelaskan',
    message: (d) => `${d.amount || 'Komisen anda'} perlu dijelaskan sekarang bagi penyelesaian ${d.reference || ''}.`,
  },
  commission_overdue: {
    title: 'Komisen tertunggak',
    message: (d) => `${d.amount || 'Komisen anda'} telah tertunggak ${d.days || 'beberapa'} hari. Jelaskan sekarang untuk terus menerima kerja.`,
  },
  settlement_paid: {
    title: 'Penyelesaian dijelaskan',
    message: (d) => `Terima kasih — penyelesaian ${d.reference || ''}${d.amount ? ` sebanyak ${d.amount}` : ''} telah dijelaskan sepenuhnya.`,
  },
  account_frozen_overdue: {
    title: 'Kerja baharu dihentikan sementara',
    message: (d) => `Anda tidak akan menerima kerja baharu sehingga komisen tertunggak anda dijelaskan${d.reason ? ` (${d.reason})` : ''}.`,
  },
  account_unfrozen: {
    title: 'Anda kembali aktif',
    message: 'Komisen anda telah dijelaskan — anda akan mula menerima kerja baharu semula.',
  },
  payouts_suspended: {
    title: 'Pembayaran ditangguhkan',
    message: 'Pembayaran ditangguhkan sehingga komisen tertunggak anda dijelaskan.',
  },
  payout_scheduled: {
    title: 'Pembayaran dijadualkan',
    message: (d) => `${d.amount || 'Pembayaran anda'} telah dijadualkan${d.when ? ` pada ${d.when}` : ''}.`,
  },
  payout_completed: {
    title: 'Pembayaran dihantar',
    message: (d) => `${d.amount || 'Pembayaran anda'} sedang dalam perjalanan ke bank anda — dana biasanya sampai dalam 1–3 hari bekerja.`,
  },
  payout_failed: {
    title: 'Pembayaran gagal',
    message: (d) => `Kami tidak dapat menghantar ${d.amount || 'pembayaran anda'}${d.reason ? `: ${d.reason}` : ''}. Sila semak butiran bank anda.`,
  },
  bank_details_verified: {
    title: 'Butiran bank disahkan',
    message: 'Butiran bank anda telah disahkan — anda akan disertakan dalam pusingan pembayaran seterusnya.',
  },
  bank_details_rejected: {
    title: 'Butiran bank perlu diperbetulkan',
    message: (d) => `Butiran bank anda tidak dapat disahkan${d.reason ? `: ${d.reason}` : ''}. Sila kemas kini.`,
  },

  // ── Partner: profile, documents, ratings ──────────────────────────────────
  profile_approved: {
    title: 'Profil diluluskan',
    message: 'Tahniah! Profil rakan kongsi anda telah diluluskan. Anda kini boleh menerima kerja.',
  },
  documents_approved: {
    title: 'Dokumen diluluskan',
    message: 'Dokumen yang anda hantar telah disahkan dan diluluskan.',
  },
  documents_rejected: {
    title: 'Dokumen perlu diperbetulkan',
    message: (d) => `Sebahagian dokumen telah ditolak${d.reason ? `: ${d.reason}` : ''}. Sila muat naik semula.`,
  },
  documents_expiring: {
    title: 'Dokumen akan tamat tempoh',
    message: (d) => `${d.docName || 'Dokumen'} anda tamat tempoh ${d.when || 'tidak lama lagi'}. Sila perbaharuinya.`,
  },
  account_suspended_warning: {
    title: 'Amaran akaun',
    message: (d) => `Akaun anda berisiko digantung${d.reason ? `: ${d.reason}` : ''}. Sila semak.`,
  },
  customer_left_review: {
    title: 'Ulasan pelanggan baharu',
    message: (d) => `${d.customerName || 'Seorang pelanggan'} memberikan anda ulasan${d.rating ? ` ${d.rating} bintang` : ''}.`,
  },
  five_star_rating: {
    title: 'Anda menerima penarafan 5 bintang!',
    message: (d) => `${d.customerName || 'Seorang pelanggan'} memberi anda 5 bintang. Kerja yang hebat!`,
  },
  low_rating_alert: {
    title: 'Penarafan rendah diterima',
    message: (d) => `Anda menerima ulasan ${d.rating || 'rendah'} bintang. Ketik untuk melihat cara penambahbaikan.`,
  },
  customer_message: {
    title: 'Mesej pelanggan baharu',
    message: (d) => `${d.customerName || 'Seorang pelanggan'} menghantar mesej kepada anda${d.serviceName ? ` mengenai ${d.serviceName}` : ''}.`,
  },
};

export const MS_EVENTS = Object.keys(CATALOG_MS);
