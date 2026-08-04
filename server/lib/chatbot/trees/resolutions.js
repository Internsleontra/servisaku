// ─────────────────────────────────────────────────────────────────────────────
// Troubleshooting resolutions — what the bot says when a support tree reaches a
// non-escalating leaf.
//
// Two rules shape every entry:
//
// 1. ONE SENTENCE. A resolution is the end of a checklist, not a manual. If it
//    needs three paragraphs, the tree asked too few questions.
//
// 2. NUMBERS ARE PLACEHOLDERS, never literals — `{{partner.freeze_after_days}}`
//    resolves against the policy catalogue at render time. This is docs/13 §J1:
//    a policy change reaches the next message with no deploy. It also means the
//    conflict rule applies to what the bot SAYS: a key whose value disagrees
//    with its governing T&C clause is BLOCKED, the resolution becomes
//    unavailable, and the bot offers a human instead of stating a disputed
//    figure. See render() in ../support.js.
//
// `action` names an optional follow-up the UI renders as a button.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Action labels, localised and defined once per route — several resolutions
 * offer the same next step, and "View bookings" written five times is five
 * chances for the Malay to drift from the English.
 */
export const ACTION_LABELS = {
  retry_payment: { en: 'Try again', ms: 'Cuba lagi' },
  bookings: { en: 'View bookings', ms: 'Lihat tempahan' },
  coupons: { en: 'Show my offers', ms: 'Tunjuk tawaran saya' },
  book: { en: 'Book again', ms: 'Tempah semula' },
  reschedule: { en: 'Pick a new time', ms: 'Pilih masa baharu' },
  chat: { en: 'Message them', ms: 'Hantar mesej' },
  resend_otp: { en: 'Resend code', ms: 'Hantar semula kod' },
  documents: { en: 'Upload document', ms: 'Muat naik dokumen' },
  availability: { en: 'Go available', ms: 'Tukar ke tersedia' },
  wallet: { en: 'Settle now', ms: 'Jelaskan sekarang' },
  bank: { en: 'Check bank details', ms: 'Semak butiran bank' },
  notification_settings: { en: 'Open settings', ms: 'Buka tetapan' },
};

export const RESOLUTIONS = {
  // ── Payment ────────────────────────────────────────────────────────────────
  offer_alternate_method: {
    text: {
      en: 'Nothing was charged, so the simplest fix is another method — FPX fails less often on mobile than cards do.',
      ms: 'Tiada caj dikenakan, jadi cuba kaedah lain — FPX kurang gagal di telefon berbanding kad.',
    },
    action: { route: 'retry_payment' },
  },
  guide_check_statement: {
    text: {
      en: 'Check your banking app for a pending authorisation rather than a completed payment — those look identical in a notification but clear on their own.',
      ms: 'Semak aplikasi bank anda untuk kebenaran tertunda, bukan pembayaran selesai — kedua-duanya nampak sama tetapi yang tertunda akan hilang sendiri.',
    },
  },
  explain_authorisation_hold: {
    text: {
      en: 'A same-day deduction on a failed booking is almost always an authorisation hold that has not been voided yet, and it drops off on its own within a few working days.',
      ms: 'Tolakan pada hari sama untuk tempahan gagal biasanya kebenaran tertunda yang belum dibatalkan, dan ia akan hilang sendiri dalam beberapa hari bekerja.',
    },
  },
  explain_two_bookings: {
    text: {
      en: 'Two charges for two different bookings are both genuine — open each booking to see what it covers.',
      ms: 'Dua caj untuk dua tempahan berbeza adalah sah — buka setiap tempahan untuk lihat butirannya.',
    },
    action: { route: 'bookings' },
  },
  explain_review_sla: {
    text: {
      en: 'It is still with our team for review — you will get a notification the moment a decision is made.',
      ms: 'Ia masih dalam semakan pasukan kami — anda akan dimaklumkan sebaik keputusan dibuat.',
    },
  },
  explain_credit_applied: {
    text: {
      en: 'Credit is applied before other payment methods at checkout, so a recent booking has probably already used part of it.',
      ms: 'Kredit digunakan sebelum kaedah pembayaran lain semasa pembayaran, jadi tempahan terkini mungkin sudah menggunakan sebahagiannya.',
    },
  },
  explain_credit_sources: {
    text: {
      en: 'Your balance is the total of every credit issued to you — goodwill, referral and promotional credit all sit in the same place.',
      ms: 'Baki anda adalah jumlah semua kredit yang diberikan — kredit ihsan, rujukan dan promosi semuanya di tempat yang sama.',
    },
  },
  explain_credit_void: {
    text: {
      en: 'Promotional credit is voided when the booking it was applied to is cancelled by the customer.',
      ms: 'Kredit promosi terbatal apabila tempahan yang menggunakannya dibatalkan oleh pelanggan.',
    },
  },
  explain_expired: {
    text: {
      en: 'That code has passed its expiry date and cannot be reinstated, but I can show you what is currently available to you.',
      ms: 'Kod itu telah tamat tempoh dan tidak boleh dipulihkan, tetapi saya boleh tunjukkan tawaran yang ada untuk anda sekarang.',
    },
    action: { route: 'coupons' },
  },
  explain_minimum: {
    text: {
      en: 'That code has a minimum spend your basket has not reached yet — adding to the booking or using a different code will work.',
      ms: 'Kod itu memerlukan perbelanjaan minimum yang belum dicapai — tambah pada tempahan atau guna kod lain.',
    },
    action: { route: 'coupons' },
  },
  explain_used: {
    text: {
      en: 'New-customer codes are one per person and cannot be reapplied, including from a second account.',
      ms: 'Kod pelanggan baharu adalah satu untuk setiap orang dan tidak boleh diguna semula, termasuk dari akaun kedua.',
    },
  },
  explain_eligibility: {
    text: {
      en: 'A plain "invalid" usually means the code is restricted to a category or customer group this booking does not fall into.',
      ms: '"Tidak sah" biasanya bermakna kod itu terhad kepada kategori atau kumpulan pelanggan yang tidak termasuk tempahan ini.',
    },
  },

  // ── Booking ────────────────────────────────────────────────────────────────
  guide_retry_booking: {
    text: {
      en: 'The booking never reached payment, so nothing was reserved — starting again should go through.',
      ms: 'Tempahan tidak sampai ke pembayaran, jadi tiada yang ditempah — cuba semula sepatutnya berjaya.',
    },
    action: { route: 'book' },
  },
  guide_retry_payment: {
    text: {
      en: 'No money left your account, so the slot was simply released — booking again is safe.',
      ms: 'Tiada wang keluar dari akaun anda, slot itu hanya dilepaskan — selamat untuk tempah semula.',
    },
    action: { route: 'book' },
  },
  explain_no_partner_available: {
    text: {
      en: 'No professional was available for that slot, so it was cancelled automatically and refunded in full — booking a day ahead gets much better coverage.',
      ms: 'Tiada profesional tersedia untuk slot itu, jadi ia dibatalkan automatik dan dibayar balik sepenuhnya — tempah sehari lebih awal untuk liputan lebih baik.',
    },
    action: { route: 'book' },
  },
  explain_partner_cancel: {
    text: {
      en: 'Your professional cancelled, and you are never charged a cancellation fee when that happens.',
      ms: 'Profesional anda membatalkan, dan anda tidak akan dikenakan yuran pembatalan dalam keadaan itu.',
    },
  },
  rematch_same_slot: {
    text: {
      en: 'I am looking for a replacement at the same time and the same price — you will get a notification the moment someone accepts.',
      ms: 'Saya sedang mencari pengganti pada masa dan harga yang sama — anda akan dimaklumkan sebaik seseorang menerima.',
    },
  },
  offer_reschedule: {
    text: {
      en: 'Let me find you another time — free of charge, since this was not your cancellation.',
      ms: 'Biar saya cari masa lain — tanpa caj, kerana ini bukan pembatalan anda.',
    },
    action: { route: 'reschedule' },
  },
  offer_full_refund: {
    text: {
      en: 'A full refund it is — you are refunded in full whenever a professional or ServisAku cancels.',
      ms: 'Bayaran balik penuh — anda dibayar balik sepenuhnya apabila profesional atau ServisAku membatalkan.',
    },
  },
  guide_contact_partner: {
    text: {
      en: 'Give them a little longer and message them through the app — that conversation is logged, which matters if this becomes a no-show claim.',
      ms: 'Beri sedikit masa lagi dan hubungi mereka melalui aplikasi — perbualan itu direkodkan, penting jika ini menjadi tuntutan tidak hadir.',
    },
    action: { route: 'chat' },
  },
  guide_cancel_rebook: {
    text: {
      en: 'The cleanest fix is to cancel this one and book the service you meant — I can walk you through either step.',
      ms: 'Cara paling bersih ialah batalkan yang ini dan tempah perkhidmatan yang anda maksudkan — saya boleh bantu untuk kedua-duanya.',
    },
  },
  guide_reschedule: {
    text: {
      en: 'You can change the date or time from the booking screen while the job has not started.',
      ms: 'Anda boleh tukar tarikh atau masa dari skrin tempahan selagi kerja belum bermula.',
    },
    action: { route: 'reschedule' },
  },
  guide_change_address: {
    text: {
      en: 'Change the address from the booking screen — but if your professional is already en route, do it through support so they are rerouted rather than turning up at the wrong block.',
      ms: 'Tukar alamat dari skrin tempahan — tetapi jika profesional sudah dalam perjalanan, buat melalui sokongan supaya mereka dialih arah.',
    },
  },
  guide_cancel_duplicate: {
    text: {
      en: 'Cancelling the duplicate is the right move — I can show you which one to keep.',
      ms: 'Batalkan yang berulang — saya boleh tunjukkan yang mana perlu dikekalkan.',
    },
    action: { route: 'bookings' },
  },

  // ── Account ────────────────────────────────────────────────────────────────
  guide_error_login: {
    text: {
      en: 'Close the app fully and reopen it, then try once more — a stale session causes most sign-in errors.',
      ms: 'Tutup aplikasi sepenuhnya dan buka semula, kemudian cuba lagi — sesi lama menyebabkan kebanyakan ralat log masuk.',
    },
  },
  guide_app_update: {
    text: {
      en: 'Check for an app update first — a screen that does nothing is usually an old build talking to a newer API.',
      ms: 'Semak kemas kini aplikasi dahulu — skrin yang tidak berfungsi biasanya versi lama berhubung dengan API baharu.',
    },
  },
  handoff_otp_tree: {
    text: {
      en: 'Let me take you through the code problem specifically.',
      ms: 'Biar saya bawa anda melalui masalah kod itu secara khusus.',
    },
  },
  guide_check_sms: {
    text: {
      en: 'Check that SMS from unknown senders is not being filtered, then request a fresh code — they expire after a few minutes.',
      ms: 'Pastikan SMS daripada penghantar tidak dikenali tidak ditapis, kemudian minta kod baharu — ia luput selepas beberapa minit.',
    },
    action: { route: 'resend_otp' },
  },
  explain_temp_lock: {
    text: {
      en: 'That is a temporary lock from repeated failed attempts and it clears on its own shortly — nothing else on your account is affected.',
      ms: 'Itu kunci sementara akibat cubaan gagal berulang dan ia akan terbuka sendiri sebentar lagi — tiada apa-apa lain terjejas.',
    },
  },

  // ── Partner ────────────────────────────────────────────────────────────────
  explain_identity_sla: {
    text: {
      en: 'Identity checks are usually done within a working day of everything being submitted.',
      ms: 'Semakan identiti biasanya selesai dalam satu hari bekerja selepas semua dihantar.',
    },
  },
  explain_bank_verify: {
    text: {
      en: 'Bank verification is a name match against your verified identity, and any change to your details resets it.',
      ms: 'Pengesahan bank ialah padanan nama dengan identiti anda yang disahkan, dan sebarang perubahan akan menetapkan semula.',
    },
  },
  explain_doc_reject: {
    text: {
      en: 'Most rejections are an unreadable expiry date — re-upload a flat, well-lit photo or the original PDF.',
      ms: 'Kebanyakan penolakan kerana tarikh luput tidak jelas — muat naik semula gambar rata dan terang atau PDF asal.',
    },
    action: { route: 'documents' },
  },
  explain_ctos_sla: {
    text: {
      en: 'The background check sits with the bureau rather than with us, and those normally take a few working days.',
      ms: 'Pemeriksaan latar belakang berada di biro, bukan dengan kami, dan biasanya mengambil beberapa hari bekerja.',
    },
  },
  guide_availability: {
    text: {
      en: 'Switch yourself to available and check your service area is set — that puts you back in the dispatch pool immediately.',
      ms: 'Tukar status kepada tersedia dan pastikan kawasan perkhidmatan ditetapkan — anda akan kembali ke kumpulan penghantaran serta-merta.',
    },
    action: { route: 'availability' },
  },
  explain_freeze: {
    text: {
      en: 'New offers pause once a settlement is {{partner.freeze_after_days}} days overdue and payouts hold at {{partner.suspend_payouts_after_days}} — clearing it restores both, and jobs you have already accepted are never affected.',
      ms: 'Tawaran baharu terhenti apabila penyelesaian tertunggak {{partner.freeze_after_days}} hari dan bayaran ditahan pada {{partner.suspend_payouts_after_days}} — jelaskan untuk pulihkan kedua-duanya; kerja yang sudah diterima tidak terjejas.',
    },
    action: { route: 'wallet' },
  },
  explain_expired_doc: {
    text: {
      en: 'A lapsed document stops dispatch immediately — upload a current one and offers resume as soon as it is approved.',
      ms: 'Dokumen luput menghentikan penghantaran serta-merta — muat naik yang terkini dan tawaran akan kembali sebaik diluluskan.',
    },
    action: { route: 'documents' },
  },
  explain_bank_unverified: {
    text: {
      en: 'You are out of the payout run until your bank details clear verification — nothing is lost, it rolls into the next one.',
      ms: 'Anda tidak termasuk dalam pusingan bayaran sehingga butiran bank disahkan — tiada yang hilang, ia dibawa ke pusingan berikutnya.',
    },
    action: { route: 'bank' },
  },
  explain_payout_timing: {
    text: {
      en: 'Payouts normally reach a bank account within {{payout.settlement_days_max}} working days of the run.',
      ms: 'Bayaran biasanya sampai ke akaun bank dalam {{payout.settlement_days_max}} hari bekerja selepas pusingan.',
    },
  },
  explain_bank_timing: {
    text: {
      en: 'Refunds normally land within {{refund.processing_days_min}} to {{refund.processing_days_max}} working days, depending on your bank.',
      ms: 'Bayaran balik biasanya sampai dalam {{refund.processing_days_min}} hingga {{refund.processing_days_max}} hari bekerja, bergantung pada bank anda.',
    },
  },
  explain_review_not_removable: {
    text: {
      en: 'Reviews are not removed for being negative — only for not being based on a real booking, containing personal data, being abusive, or being retaliatory.',
      ms: 'Ulasan tidak dibuang kerana negatif — hanya jika bukan berdasarkan tempahan sebenar, mengandungi data peribadi, kesat, atau balas dendam.',
    },
  },

  // ── Technical ──────────────────────────────────────────────────────────────
  guide_update: {
    text: {
      en: 'Update to the latest version first — most crashes people report are already fixed in a newer build.',
      ms: 'Kemas kini ke versi terkini dahulu — kebanyakan masalah yang dilaporkan sudah diperbaiki dalam versi baharu.',
    },
  },
  guide_hard_refresh: {
    text: {
      en: 'A blank page is almost always a cached bundle — hard refresh with Ctrl+Shift+R, or Cmd+Shift+R on a Mac.',
      ms: 'Halaman kosong hampir selalu kerana cache — muat semula dengan Ctrl+Shift+R, atau Cmd+Shift+R pada Mac.',
    },
  },
  guide_reinstall: {
    text: {
      en: 'Force-close the app and reopen it; if it is still blank, reinstalling clears a corrupted cache without touching your account.',
      ms: 'Tutup paksa aplikasi dan buka semula; jika masih kosong, pasang semula akan bersihkan cache rosak tanpa menjejaskan akaun anda.',
    },
  },
  guide_os_permission: {
    text: {
      en: 'Turn notifications on for ServisAku in your phone settings — the app cannot enable that itself.',
      ms: 'Hidupkan pemberitahuan untuk ServisAku dalam tetapan telefon — aplikasi tidak boleh menghidupkannya sendiri.',
    },
  },
  guide_inapp_prefs: {
    text: {
      en: 'Check Settings → Notifications inside the app — booking updates can be switched off there even with the phone permission granted.',
      ms: 'Semak Tetapan → Pemberitahuan dalam aplikasi — kemas kini tempahan boleh dimatikan di situ walaupun kebenaran telefon diberikan.',
    },
    action: { route: 'notification_settings' },
  },
  guide_precise_location: {
    text: {
      en: 'Set location permission to precise rather than approximate — approximate is accurate to a few hundred metres, which can put you on the wrong street.',
      ms: 'Tetapkan kebenaran lokasi kepada tepat, bukan anggaran — anggaran hanya tepat beberapa ratus meter dan boleh letak anda di jalan yang salah.',
    },
  },
};

/** Keys referenced by a tree leaf but not authored here — a CI check. */
export function missingResolutions(resolveKeys) {
  return resolveKeys.filter((k) => !RESOLUTIONS[k]);
}

/** Every `{{policy.key}}` a resolution depends on. */
export function placeholdersIn(entry) {
  const found = new Set();
  for (const text of Object.values(entry?.text || {})) {
    for (const m of String(text).matchAll(/\{\{([a-z0-9_.]+)\}\}/gi)) found.add(m[1]);
  }
  return [...found];
}
