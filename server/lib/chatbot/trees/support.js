// ─────────────────────────────────────────────────────────────────────────────
// Support troubleshooting trees.
//
// Same runner as the diagnostic trees; different leaf shape. A leaf here is a
// RESOLUTION, not a service:
//
//   { resolve: '<message key>', escalate: false }   ← fixed it
//   { resolve: null, escalate: true, category, priority }  ← genuinely needs a human
//
// This is what makes the request's rule — "only escalate if the issue cannot be
// resolved" — structural rather than a prompt instruction. Escalation is only
// reachable from a leaf that declares it, so the bot cannot abandon a checklist
// halfway through.
//
// Safety intents deliberately have NO tree. Nobody troubleshoots a harassment
// report; those escalate on turn one (see guardrails).
// ─────────────────────────────────────────────────────────────────────────────

const YES = { en: 'Yes', ms: 'Ya' };
const NO = { en: 'No', ms: 'Tidak' };
const UNSURE = { en: 'Not sure', ms: 'Tidak pasti' };

const yesNo = (onYes, onNo, onUnknown = onNo) => ({
  yes: { ...onYes, label: YES },
  no: { ...onNo, label: NO },
  unknown: { ...onUnknown, label: UNSURE },
});

const PAYMENT_METHODS = {
  fpx: { label: { en: 'FPX', ms: 'FPX' } },
  card: { label: { en: 'Card', ms: 'Kad' } },
  ewallet: { label: { en: 'E-wallet', ms: 'E-dompet' } },
  duitnow: { label: { en: 'DuitNow', ms: 'DuitNow' } },
};

const methodNode = (ask, next) => ({
  ask,
  answers: {
    ...Object.fromEntries(Object.entries(PAYMENT_METHODS).map(([k, v]) => [k, { ...v, next }])),
    unknown: { next, label: UNSURE },
  },
});

export const SUPPORT_TREES = [
  // ── Payment ───────────────────────────────────────────────────────────────
  {
    id: 'payment_failed',
    audience: 'all',
    group: 'payment',
    root: 'method',
    nodes: {
      method: methodNode({
        en: 'Which payment method did you use?',
        ms: 'Kaedah pembayaran mana yang anda guna?',
      }, 'deducted'),
      deducted: {
        ask: {
          en: 'Was the money actually deducted from your account?',
          ms: 'Adakah wang benar-benar ditolak dari akaun anda?',
        },
        answers: yesNo({ next: 'when' }, { leaf: 'retry' }, { leaf: 'check_statement' }),
      },
      when: {
        ask: {
          en: 'When was it deducted?',
          ms: 'Bila ia ditolak?',
        },
        answers: {
          today: { leaf: 'pending_settlement', label: { en: 'Today', ms: 'Hari ini' } },
          older: { leaf: 'escalate_stuck', label: { en: 'Earlier', ms: 'Lebih awal' } },
          unknown: { leaf: 'check_statement' },
        },
      },
    },
    leaves: {
      retry: { resolve: 'offer_alternate_method', escalate: false },
      check_statement: { resolve: 'guide_check_statement', escalate: false },
      pending_settlement: { resolve: 'explain_authorisation_hold', escalate: false },
      escalate_stuck: { resolve: null, escalate: true, category: 'payment', priority: 'high' },
    },
  },

  {
    id: 'double_charge',
    audience: 'all',
    group: 'payment',
    root: 'same_booking',
    nodes: {
      same_booking: {
        ask: {
          en: 'Are both charges for the same booking, or two different ones?',
          ms: 'Kedua-dua caj untuk tempahan sama, atau dua tempahan berbeza?',
        },
        answers: {
          same: { leaf: 'escalate_duplicate', label: { en: 'Same booking', ms: 'Tempahan sama' } },
          different: { leaf: 'explain_two_bookings', label: { en: 'Two bookings', ms: 'Dua tempahan' } },
          unknown: { leaf: 'escalate_duplicate' },
        },
      },
    },
    leaves: {
      escalate_duplicate: { resolve: null, escalate: true, category: 'payment', priority: 'high' },
      explain_two_bookings: { resolve: 'explain_two_bookings', escalate: false },
    },
  },

  {
    id: 'refund_pending',
    audience: 'consumer',
    group: 'payment',
    root: 'approved',
    nodes: {
      approved: {
        ask: {
          en: 'Has the refund been approved yet, or is it still under review?',
          ms: 'Adakah bayaran balik sudah diluluskan, atau masih dalam semakan?',
        },
        answers: {
          approved: { next: 'elapsed', label: { en: 'Approved', ms: 'Diluluskan' } },
          review: { leaf: 'explain_review_sla', label: { en: 'Under review', ms: 'Dalam semakan' } },
          unknown: { leaf: 'explain_review_sla' },
        },
      },
      elapsed: {
        ask: {
          en: 'How long ago was it approved?',
          ms: 'Berapa lama sejak ia diluluskan?',
        },
        answers: {
          recent: { leaf: 'explain_bank_timing', label: { en: 'Under a week', ms: 'Kurang seminggu' } },
          long: { leaf: 'escalate_late_refund', label: { en: 'Over a week', ms: 'Lebih seminggu' } },
          unknown: { leaf: 'explain_bank_timing' },
        },
      },
    },
    leaves: {
      explain_review_sla: { resolve: 'explain_review_sla', escalate: false },
      explain_bank_timing: { resolve: 'explain_bank_timing', escalate: false },
      escalate_late_refund: { resolve: null, escalate: true, category: 'refund', priority: 'high' },
    },
  },

  {
    id: 'wallet_issue',
    audience: 'consumer',
    group: 'payment',
    root: 'direction',
    nodes: {
      direction: {
        ask: {
          en: 'Is the balance higher than you expected, lower, or has a credit disappeared?',
          ms: 'Baki lebih tinggi daripada jangkaan, lebih rendah, atau kredit hilang?',
        },
        answers: {
          lower: { leaf: 'explain_credit_applied', label: { en: 'Lower', ms: 'Lebih rendah' } },
          higher: { leaf: 'explain_credit_sources', label: { en: 'Higher', ms: 'Lebih tinggi' } },
          gone: { leaf: 'explain_credit_void', label: { en: 'A credit vanished', ms: 'Kredit hilang' } },
          unknown: { leaf: 'explain_credit_sources' },
        },
      },
    },
    leaves: {
      explain_credit_applied: { resolve: 'explain_credit_applied', escalate: false },
      explain_credit_sources: { resolve: 'explain_credit_sources', escalate: false },
      explain_credit_void: { resolve: 'explain_credit_void', escalate: false },
    },
  },

  {
    id: 'coupon_invalid',
    audience: 'consumer',
    group: 'payment',
    root: 'message',
    nodes: {
      message: {
        ask: {
          en: 'What does the app say when you apply it?',
          ms: 'Apa yang aplikasi papar bila anda guna kod itu?',
        },
        answers: {
          expired: { leaf: 'explain_expired', label: { en: 'Expired', ms: 'Tamat tempoh' } },
          minimum: { leaf: 'explain_minimum', label: { en: 'Minimum spend', ms: 'Belanja minimum' } },
          used: { leaf: 'explain_used', label: { en: 'Already used', ms: 'Sudah diguna' } },
          invalid: { leaf: 'explain_eligibility', label: { en: 'Just "invalid"', ms: 'Hanya "tidak sah"' } },
          unknown: { leaf: 'explain_eligibility' },
        },
      },
    },
    leaves: {
      explain_expired: { resolve: 'explain_expired', escalate: false },
      explain_minimum: { resolve: 'explain_minimum', escalate: false },
      explain_used: { resolve: 'explain_used', escalate: false },
      explain_eligibility: { resolve: 'explain_eligibility', escalate: false },
    },
  },

  // ── Booking ───────────────────────────────────────────────────────────────
  {
    id: 'booking_failed',
    audience: 'consumer',
    group: 'booking',
    root: 'reached_payment',
    nodes: {
      reached_payment: {
        ask: {
          en: 'Did you get as far as the payment screen?',
          ms: 'Adakah anda sampai ke skrin pembayaran?',
        },
        answers: yesNo({ next: 'deducted' }, { leaf: 'guide_retry_booking' }),
      },
      deducted: {
        ask: {
          en: 'Was any money deducted?',
          ms: 'Ada wang ditolak?',
        },
        answers: yesNo({ leaf: 'escalate_charged_no_booking' }, { leaf: 'guide_retry_payment' }),
      },
    },
    leaves: {
      guide_retry_booking: { resolve: 'guide_retry_booking', escalate: false },
      guide_retry_payment: { resolve: 'guide_retry_payment', escalate: false },
      escalate_charged_no_booking: { resolve: null, escalate: true, category: 'payment', priority: 'high' },
    },
  },

  {
    id: 'booking_cancelled',
    audience: 'consumer',
    group: 'booking',
    root: 'by_whom',
    nodes: {
      by_whom: {
        ask: {
          en: 'Do you know who cancelled it?',
          ms: 'Anda tahu siapa yang batalkan?',
        },
        answers: {
          platform: { leaf: 'explain_no_partner', label: { en: 'ServisAku did', ms: 'ServisAku' } },
          partner: { leaf: 'explain_partner_cancel', label: { en: 'The professional', ms: 'Profesional' } },
          unknown: { leaf: 'explain_no_partner' },
        },
      },
    },
    leaves: {
      explain_no_partner: { resolve: 'explain_no_partner_available', escalate: false },
      explain_partner_cancel: { resolve: 'explain_partner_cancel', escalate: false },
    },
  },

  {
    id: 'partner_unavailable',
    audience: 'consumer',
    group: 'booking',
    root: 'preference',
    nodes: {
      preference: {
        ask: {
          en: 'Would you like the same slot with someone else, a different time, or a refund?',
          ms: 'Anda mahu slot sama dengan orang lain, masa lain, atau bayaran balik?',
        },
        answers: {
          same: { leaf: 'rematch_same_slot', label: { en: 'Same slot', ms: 'Slot sama' } },
          other: { leaf: 'offer_reschedule', label: { en: 'Different time', ms: 'Masa lain' } },
          refund: { leaf: 'offer_full_refund', label: { en: 'Refund', ms: 'Bayaran balik' } },
          unknown: { leaf: 'rematch_same_slot' },
        },
      },
    },
    leaves: {
      rematch_same_slot: { resolve: 'rematch_same_slot', escalate: false },
      offer_reschedule: { resolve: 'offer_reschedule', escalate: false },
      offer_full_refund: { resolve: 'offer_full_refund', escalate: false },
    },
  },

  {
    id: 'partner_noshow',
    audience: 'consumer',
    group: 'booking',
    root: 'elapsed',
    nodes: {
      elapsed: {
        ask: {
          en: 'How long past the scheduled start is it now?',
          ms: 'Berapa lama sudah lepas masa yang dijadualkan?',
        },
        answers: {
          under30: { leaf: 'guide_contact_partner', label: { en: 'Under 30 minutes', ms: 'Kurang 30 minit' } },
          over30: { leaf: 'escalate_noshow', label: { en: 'Over 30 minutes', ms: 'Lebih 30 minit' } },
          unknown: { leaf: 'guide_contact_partner' },
        },
      },
    },
    leaves: {
      guide_contact_partner: { resolve: 'guide_contact_partner', escalate: false },
      escalate_noshow: { resolve: null, escalate: true, category: 'booking', priority: 'high' },
    },
  },

  {
    id: 'wrong_booking',
    audience: 'consumer',
    group: 'booking',
    root: 'what_wrong',
    nodes: {
      what_wrong: {
        ask: {
          en: 'What is wrong with it — the service, the date, or the address?',
          ms: 'Apa yang salah — perkhidmatan, tarikh, atau alamat?',
        },
        answers: {
          service: { leaf: 'guide_cancel_rebook', label: { en: 'Service', ms: 'Perkhidmatan' } },
          date: { leaf: 'guide_reschedule', label: { en: 'Date or time', ms: 'Tarikh/masa' } },
          address: { leaf: 'guide_change_address', label: { en: 'Address', ms: 'Alamat' } },
          duplicate: { leaf: 'guide_cancel_duplicate', label: { en: 'I booked twice', ms: 'Tempah dua kali' } },
          unknown: { leaf: 'guide_cancel_rebook' },
        },
      },
    },
    leaves: {
      guide_cancel_rebook: { resolve: 'guide_cancel_rebook', escalate: false },
      guide_reschedule: { resolve: 'guide_reschedule', escalate: false },
      guide_change_address: { resolve: 'guide_change_address', escalate: false },
      guide_cancel_duplicate: { resolve: 'guide_cancel_duplicate', escalate: false },
    },
  },

  // ── Account ───────────────────────────────────────────────────────────────
  {
    id: 'login_problem',
    audience: 'all',
    group: 'account',
    root: 'symptom',
    nodes: {
      symptom: {
        ask: {
          en: 'What happens when you try — an error, nothing at all, or no code arrives?',
          ms: 'Apa yang berlaku — ada ralat, tiada apa-apa, atau kod tidak sampai?',
        },
        answers: {
          error: { leaf: 'guide_error_login', label: { en: 'An error', ms: 'Ralat' } },
          nothing: { leaf: 'guide_app_update', label: { en: 'Nothing happens', ms: 'Tiada apa-apa' } },
          no_otp: { leaf: 'to_otp_tree', label: { en: 'No code arrives', ms: 'Kod tidak sampai' } },
          unknown: { leaf: 'guide_app_update' },
        },
      },
    },
    leaves: {
      guide_error_login: { resolve: 'guide_error_login', escalate: false },
      guide_app_update: { resolve: 'guide_app_update', escalate: false },
      to_otp_tree: { resolve: 'handoff_otp_tree', escalate: false, nextTree: 'otp_not_received' },
    },
  },

  {
    id: 'otp_not_received',
    audience: 'all',
    group: 'account',
    root: 'right_number',
    nodes: {
      right_number: {
        ask: {
          en: 'Is the number on your account the one you have with you now?',
          ms: 'Adakah nombor pada akaun anda nombor yang ada dengan anda sekarang?',
        },
        answers: yesNo({ next: 'attempts' }, { leaf: 'escalate_number_change' }),
      },
      attempts: {
        ask: {
          en: 'How many times have you requested a code?',
          ms: 'Berapa kali anda minta kod?',
        },
        answers: {
          once: { leaf: 'guide_check_sms', label: { en: 'Once or twice', ms: 'Sekali atau dua' } },
          many: { leaf: 'escalate_otp_delivery', label: { en: 'Three or more', ms: 'Tiga atau lebih' } },
          unknown: { leaf: 'guide_check_sms' },
        },
      },
    },
    leaves: {
      guide_check_sms: { resolve: 'guide_check_sms', escalate: false },
      escalate_otp_delivery: { resolve: null, escalate: true, category: 'technical', priority: 'high' },
      escalate_number_change: { resolve: null, escalate: true, category: 'account', priority: 'normal' },
    },
  },

  {
    id: 'account_locked',
    audience: 'all',
    group: 'account',
    root: 'cause',
    nodes: {
      cause: {
        ask: {
          en: 'Was it locked after failed sign-in attempts, or suspended by our team?',
          ms: 'Ia dikunci selepas cubaan log masuk gagal, atau digantung oleh pasukan kami?',
        },
        answers: {
          attempts: { leaf: 'explain_temp_lock', label: { en: 'Failed attempts', ms: 'Cubaan gagal' } },
          suspended: { leaf: 'escalate_suspension', label: { en: 'Suspended', ms: 'Digantung' } },
          unknown: { leaf: 'explain_temp_lock' },
        },
      },
    },
    leaves: {
      explain_temp_lock: { resolve: 'explain_temp_lock', escalate: false },
      escalate_suspension: { resolve: null, escalate: true, category: 'account', priority: 'normal' },
    },
  },

  // ── Partner ───────────────────────────────────────────────────────────────
  {
    id: 'verification_pending',
    audience: 'partner',
    group: 'partner',
    root: 'stage',
    nodes: {
      stage: {
        ask: {
          en: 'Which part is still outstanding — identity, bank, documents, or the background check?',
          ms: 'Bahagian mana masih tertunggak — identiti, bank, dokumen, atau pemeriksaan latar belakang?',
        },
        answers: {
          identity: { leaf: 'explain_identity_sla', label: { en: 'Identity', ms: 'Identiti' } },
          bank: { leaf: 'explain_bank_verify', label: { en: 'Bank', ms: 'Bank' } },
          documents: { leaf: 'explain_doc_reject', label: { en: 'Documents', ms: 'Dokumen' } },
          background: { next: 'days', label: { en: 'Background check', ms: 'Pemeriksaan latar' } },
          unknown: { next: 'days' },
        },
      },
      days: {
        ask: {
          en: 'How many working days has the background check been running?',
          ms: 'Berapa hari bekerja pemeriksaan latar belakang berjalan?',
        },
        answers: {
          within: { leaf: 'explain_ctos_sla', label: { en: 'Under 5', ms: 'Kurang 5' } },
          over: { leaf: 'escalate_ctos', label: { en: '5 or more', ms: '5 atau lebih' } },
          unknown: { leaf: 'explain_ctos_sla' },
        },
      },
    },
    leaves: {
      explain_identity_sla: { resolve: 'explain_identity_sla', escalate: false },
      explain_bank_verify: { resolve: 'explain_bank_verify', escalate: false },
      explain_doc_reject: { resolve: 'explain_doc_reject', escalate: false },
      explain_ctos_sla: { resolve: 'explain_ctos_sla', escalate: false },
      escalate_ctos: { resolve: null, escalate: true, category: 'account', priority: 'normal' },
    },
  },

  {
    id: 'no_jobs_visible',
    audience: 'partner',
    group: 'partner',
    root: 'available',
    nodes: {
      available: {
        ask: {
          en: 'Are you set to available, with your service area configured?',
          ms: 'Adakah anda ditetapkan sebagai tersedia, dengan kawasan perkhidmatan ditetapkan?',
        },
        answers: yesNo({ next: 'account_state' }, { leaf: 'guide_availability' }),
      },
      account_state: {
        ask: {
          en: 'Does your Wallet show any outstanding commission, or your profile any expired document?',
          ms: 'Adakah Dompet anda menunjukkan komisen tertunggak, atau profil ada dokumen tamat tempoh?',
        },
        answers: {
          commission: { leaf: 'explain_freeze', label: { en: 'Outstanding commission', ms: 'Komisen tertunggak' } },
          document: { leaf: 'explain_expired_doc', label: { en: 'Expired document', ms: 'Dokumen tamat tempoh' } },
          neither: { leaf: 'escalate_dispatch', label: { en: 'Neither', ms: 'Tiada' } },
          unknown: { leaf: 'escalate_dispatch' },
        },
      },
    },
    leaves: {
      guide_availability: { resolve: 'guide_availability', escalate: false },
      explain_freeze: { resolve: 'explain_freeze', escalate: false },
      explain_expired_doc: { resolve: 'explain_expired_doc', escalate: false },
      escalate_dispatch: { resolve: null, escalate: true, category: 'technical', priority: 'normal' },
    },
  },

  {
    id: 'payout_delay',
    audience: 'partner',
    group: 'partner',
    root: 'bank_verified',
    nodes: {
      bank_verified: {
        ask: {
          en: 'Is your bank account showing as verified?',
          ms: 'Adakah akaun bank anda menunjukkan status disahkan?',
        },
        answers: yesNo({ next: 'elapsed' }, { leaf: 'explain_bank_unverified' }),
      },
      elapsed: {
        ask: {
          en: 'How long since the payout run?',
          ms: 'Berapa lama sejak pusingan bayaran?',
        },
        answers: {
          within: { leaf: 'explain_bank_timing', label: { en: 'Under 3 working days', ms: 'Kurang 3 hari bekerja' } },
          over: { leaf: 'escalate_payout', label: { en: 'Longer', ms: 'Lebih lama' } },
          unknown: { leaf: 'explain_bank_timing' },
        },
      },
    },
    leaves: {
      explain_bank_unverified: { resolve: 'explain_bank_unverified', escalate: false },
      explain_bank_timing: { resolve: 'explain_payout_timing', escalate: false },
      escalate_payout: { resolve: null, escalate: true, category: 'payment', priority: 'high' },
    },
  },

  {
    id: 'rating_dispute',
    audience: 'partner',
    group: 'partner',
    root: 'grounds',
    nodes: {
      grounds: {
        ask: {
          en: 'On what grounds — not a real booking, abusive content, personal data, or retaliation?',
          ms: 'Atas alasan apa — bukan tempahan sebenar, kandungan kesat, data peribadi, atau balas dendam?',
        },
        answers: {
          not_real: { leaf: 'escalate_moderation', label: { en: 'Not a real booking', ms: 'Bukan tempahan sebenar' } },
          abusive: { leaf: 'escalate_moderation', label: { en: 'Abusive', ms: 'Kesat' } },
          personal: { leaf: 'escalate_moderation', label: { en: 'Personal data', ms: 'Data peribadi' } },
          just_unfair: { leaf: 'explain_not_removable', label: { en: 'It is just unfair', ms: 'Ia tidak adil' } },
          unknown: { leaf: 'explain_not_removable' },
        },
      },
    },
    leaves: {
      escalate_moderation: { resolve: null, escalate: true, category: 'complaint', priority: 'normal' },
      explain_not_removable: { resolve: 'explain_review_not_removable', escalate: false },
    },
  },

  {
    id: 'suspension',
    audience: 'partner',
    group: 'partner',
    root: 'known_reason',
    nodes: {
      known_reason: {
        ask: {
          en: 'Does your Wallet or profile show a reason — overdue commission, or an expired document?',
          ms: 'Adakah Dompet atau profil menunjukkan sebab — komisen tertunggak, atau dokumen tamat tempoh?',
        },
        answers: {
          commission: { leaf: 'explain_freeze', label: { en: 'Overdue commission', ms: 'Komisen tertunggak' } },
          document: { leaf: 'explain_expired_doc', label: { en: 'Expired document', ms: 'Dokumen tamat tempoh' } },
          none: { leaf: 'escalate_appeal', label: { en: 'No reason shown', ms: 'Tiada sebab' } },
          unknown: { leaf: 'escalate_appeal' },
        },
      },
    },
    leaves: {
      explain_freeze: { resolve: 'explain_freeze', escalate: false },
      explain_expired_doc: { resolve: 'explain_expired_doc', escalate: false },
      escalate_appeal: { resolve: null, escalate: true, category: 'account', priority: 'high' },
    },
  },

  // ── Technical ─────────────────────────────────────────────────────────────
  {
    id: 'app_crash',
    audience: 'all',
    group: 'technical',
    root: 'when',
    nodes: {
      when: {
        ask: {
          en: 'When does it crash — on opening, on a particular screen, or randomly?',
          ms: 'Bila ia terhenti — semasa buka, pada skrin tertentu, atau secara rawak?',
        },
        answers: {
          opening: { next: 'updated', label: { en: 'On opening', ms: 'Semasa buka' } },
          screen: { next: 'updated', label: { en: 'A screen', ms: 'Skrin tertentu' } },
          random: { next: 'updated', label: { en: 'Randomly', ms: 'Rawak' } },
          unknown: { next: 'updated' },
        },
      },
      updated: {
        ask: {
          en: 'Are you on the latest app version?',
          ms: 'Adakah anda menggunakan versi aplikasi terkini?',
        },
        answers: yesNo({ leaf: 'escalate_crash' }, { leaf: 'guide_update' }),
      },
    },
    leaves: {
      guide_update: { resolve: 'guide_update', escalate: false },
      escalate_crash: { resolve: null, escalate: true, category: 'technical', priority: 'normal' },
    },
  },

  {
    id: 'white_screen',
    audience: 'all',
    group: 'technical',
    root: 'surface',
    nodes: {
      surface: {
        ask: {
          en: 'Is this the phone app or the website?',
          ms: 'Ini aplikasi telefon atau laman web?',
        },
        answers: {
          web: { leaf: 'guide_hard_refresh', label: { en: 'Website', ms: 'Laman web' } },
          app: { leaf: 'guide_reinstall', label: { en: 'Phone app', ms: 'Aplikasi' } },
          unknown: { leaf: 'guide_hard_refresh' },
        },
      },
    },
    leaves: {
      guide_hard_refresh: { resolve: 'guide_hard_refresh', escalate: false },
      guide_reinstall: { resolve: 'guide_reinstall', escalate: false },
    },
  },

  {
    id: 'notifications_off',
    audience: 'all',
    group: 'technical',
    root: 'os_permission',
    nodes: {
      os_permission: {
        ask: {
          en: 'Are notifications allowed for ServisAku in your phone settings?',
          ms: 'Adakah pemberitahuan dibenarkan untuk ServisAku dalam tetapan telefon?',
        },
        answers: yesNo({ leaf: 'guide_inapp_prefs' }, { leaf: 'guide_os_permission' }),
      },
    },
    leaves: {
      guide_os_permission: { resolve: 'guide_os_permission', escalate: false },
      guide_inapp_prefs: { resolve: 'guide_inapp_prefs', escalate: false },
    },
  },

  {
    id: 'gps_issue',
    audience: 'all',
    group: 'technical',
    root: 'precision',
    nodes: {
      precision: {
        ask: {
          en: 'Is location permission set to precise, or approximate?',
          ms: 'Adakah kebenaran lokasi ditetapkan tepat, atau anggaran?',
        },
        answers: {
          precise: { leaf: 'escalate_gps', label: { en: 'Precise', ms: 'Tepat' } },
          approximate: { leaf: 'guide_precise_location', label: { en: 'Approximate', ms: 'Anggaran' } },
          unknown: { leaf: 'guide_precise_location' },
        },
      },
    },
    leaves: {
      guide_precise_location: { resolve: 'guide_precise_location', escalate: false },
      escalate_gps: { resolve: null, escalate: true, category: 'technical', priority: 'normal' },
    },
  },
];

export const SUPPORT_TREES_BY_ID = Object.fromEntries(SUPPORT_TREES.map((tr) => [tr.id, tr]));
