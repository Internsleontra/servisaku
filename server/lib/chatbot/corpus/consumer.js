// ─────────────────────────────────────────────────────────────────────────────
// Consumer knowledge corpus.
//
// Authored in code rather than the database, for the same reason
// notifications/catalog.js is: reviewable in a PR, deploys atomically with the
// behaviour it describes. Admin-editable HelpArticle rows layer on top.
//
// TWO RULES, both enforced by tests:
//
//   1. No business number is ever written as a literal. Numbers are
//      `{{policy.key}}` placeholders resolved at answer time (see policyText.js),
//      so a policy change reaches the next message with no deploy — and a value
//      that disagrees with its T&C clause silences the sentence instead of
//      stating a disputed figure.
//
//   2. Every answer is authored in both supported languages, English and
//      Bahasa Malaysia. Machine-translating a refund rule is a liability, not a
//      shortcut.
//
// `q` holds trigger phrases in both languages, flat — keeping them in one list
// makes an entry readable as a single unit.
// ─────────────────────────────────────────────────────────────────────────────

export const CONSUMER_CORPUS = [
  // ── Booking ────────────────────────────────────────────────────────────────
  {
    key: 'booking_how_to',
    topic: 'booking',
    q: ['how do i book', 'book a service', 'make a booking', 'tempah', 'bagaimana tempah'],
    a: {
      en: 'Pick the service on the Explore page, answer a few questions about the job so we can price it accurately, choose a date and time, then confirm — you see the full price including SST before you pay.',
      ms: 'Pilih perkhidmatan di halaman Explore, jawab beberapa soalan tentang kerja itu supaya kami boleh menetapkan harga dengan tepat, pilih tarikh dan masa, kemudian sahkan — anda lihat harga penuh termasuk SST sebelum membayar.',
    },
  },
  {
    key: 'booking_confirmation',
    topic: 'booking',
    q: ['is my booking confirmed', 'booking confirmation', 'when is it confirmed', 'tempahan disahkan'],
    a: {
      en: 'A booking is confirmed only once you get a confirmation in the app, by push, SMS or email — availability shown before that is indicative, and no contract exists until a professional is assigned.',
      ms: 'Tempahan hanya disahkan setelah anda menerima pengesahan dalam aplikasi, melalui push, SMS atau e-mel — ketersediaan sebelum itu hanya panduan.',
    },
    clauses: ['6.4'],
  },
  {
    key: 'booking_assignment',
    topic: 'booking',
    q: ['who will come', 'which professional', 'can i choose the professional', 'siapa akan datang'],
    a: {
      en: 'We match on proximity, rating, completion history, category competency and language — unless you book a named professional and they accept, we cannot guarantee a specific person.',
      ms: 'Kami padankan berdasarkan jarak, penilaian, sejarah kerja, kecekapan kategori dan bahasa — melainkan anda menempah profesional tertentu dan mereka menerima, kami tidak boleh menjamin orang tertentu.',
    },
    clauses: ['6.5', '6.6'],
  },
  {
    key: 'booking_reschedule',
    topic: 'booking',
    q: ['reschedule', 'change the date', 'move my booking', 'different time', 'tukar tarikh'],
    a: {
      en: 'Change the date or time from your booking screen while the job has not started — both you and your professional are notified. If it has already started, raise a support ticket instead.',
      ms: 'Tukar tarikh atau masa dari skrin tempahan selagi kerja belum bermula — anda dan profesional akan dimaklumkan. Jika sudah bermula, buka tiket sokongan.',
    },
  },
  {
    key: 'booking_tracking',
    topic: 'booking',
    q: ['track my professional', 'where is the technician', 'live tracking', 'jejak'],
    a: {
      en: 'Once your professional is on the way you can follow them on the map from the booking screen, with a live arrival estimate.',
      ms: 'Sebaik profesional dalam perjalanan, anda boleh ikuti di peta dari skrin tempahan, dengan anggaran ketibaan langsung.',
    },
  },
  {
    key: 'booking_eta_estimate',
    topic: 'booking',
    q: ['arrival time', 'how long will it take', 'estimated duration', 'masa tiba'],
    a: {
      en: 'Arrival times and durations are estimates from mapping and past jobs, not commitments — traffic, building access and the actual condition on site all move them.',
      ms: 'Masa ketibaan dan tempoh adalah anggaran daripada peta dan kerja lepas, bukan komitmen — lalu lintas, akses bangunan dan keadaan sebenar mempengaruhinya.',
    },
    clauses: ['6.7'],
  },
  {
    key: 'booking_access',
    topic: 'booking',
    q: ['guard pass', 'access card', 'lift booking', 'condo access', 'kad akses'],
    a: {
      en: 'For strata and gated properties please arrange visitor registration, a guard pass, access card and lift booking in advance — any charge the building levies for access is yours.',
      ms: 'Untuk kondominium dan kawasan berpagar, sila uruskan pendaftaran pelawat, pas pengawal, kad akses dan tempahan lif lebih awal — sebarang caj bangunan adalah tanggungan anda.',
    },
    clauses: ['12.2'],
  },
  {
    key: 'booking_adult_present',
    topic: 'booking',
    q: ['do i need to be home', 'must someone be present', 'can i leave', 'perlu ada di rumah'],
    a: {
      en: 'Someone aged 18 or over needs to be there for the whole booking unless we have said the service can be done unattended, and a professional must never be left alone with a child.',
      ms: 'Seseorang berumur 18 tahun ke atas perlu hadir sepanjang tempahan melainkan kami nyatakan perkhidmatan boleh dilakukan tanpa pengawasan, dan profesional tidak boleh ditinggalkan bersendirian dengan kanak-kanak.',
    },
    clauses: ['12.3'],
  },
  {
    key: 'booking_recurring',
    topic: 'booking',
    q: ['recurring booking', 'weekly cleaning', 'regular service', 'tempahan berulang'],
    a: {
      en: 'Each occurrence of a recurring booking is a separate booking — separately charged and separately cancellable. You can cancel the schedule at any time, and we try but cannot promise the same professional each visit.',
      ms: 'Setiap kejadian tempahan berulang adalah tempahan berasingan — dicaj dan dibatalkan secara berasingan. Anda boleh batalkan jadual bila-bila masa.',
    },
    clauses: ['6.10'],
  },
  {
    key: 'booking_emergency',
    topic: 'booking',
    q: ['emergency booking', 'same day', 'urgent service', 'after hours', 'kecemasan'],
    a: {
      en: 'Some categories offer instant, same-day, after-hours or emergency slots. Those can carry a surcharge and a shorter free-cancellation window, both shown before you confirm.',
      ms: 'Sesetengah kategori menawarkan slot segera, hari sama, luar waktu atau kecemasan. Ia mungkin dikenakan surcaj dan tempoh pembatalan percuma lebih pendek, kedua-duanya ditunjukkan sebelum anda sahkan.',
    },
    clauses: ['6.9'],
  },
  {
    key: 'booking_working_hours',
    topic: 'booking',
    q: ['what time do you operate', 'opening hours', 'working hours', 'waktu operasi'],
    a: {
      en: 'Standard bookings run {{booking.working_hours}} Malaysian time, with emergency and after-hours slots in some categories.',
      ms: 'Tempahan biasa berjalan {{booking.working_hours}} waktu Malaysia, dengan slot kecemasan dan luar waktu dalam sesetengah kategori.',
    },
  },
  {
    key: 'booking_additional_work',
    topic: 'booking',
    q: ['extra work', 'more than expected', 'additional charge on site', 'kerja tambahan'],
    a: {
      en: 'If the job turns out bigger than booked, your professional must stop, explain, and get your approval for the revised price in the app before continuing — work done without in-app approval is not chargeable to you.',
      ms: 'Jika kerja lebih besar daripada yang ditempah, profesional mesti berhenti, terangkan, dan dapatkan kelulusan anda untuk harga baharu dalam aplikasi sebelum meneruskan.',
    },
    clauses: ['6.17', '10.4'],
  },

  // ── Payment ────────────────────────────────────────────────────────────────
  {
    key: 'payment_methods',
    topic: 'payment',
    q: ['how can i pay', 'payment methods', 'pay by card', 'fpx', 'duitnow', 'cara bayar'],
    a: {
      en: 'FPX online banking, DuitNow, credit and debit cards, supported e-wallets and ServisAku credit — plus Cash on Completion where it is offered for the service.',
      ms: 'Perbankan dalam talian FPX, DuitNow, kad kredit dan debit, e-dompet yang disokong dan kredit ServisAku — serta Tunai Selepas Siap jika ditawarkan.',
    },
  },
  {
    key: 'payment_cash',
    topic: 'payment',
    q: ['cash payment', 'pay cash', 'can i pay cash', 'bayar tunai'],
    a: {
      en: 'Where Cash on Completion is offered, pay the exact amount to your professional when the job is done — they record it in the app and you get a digital receipt straight away. Never pay outside the app.',
      ms: 'Jika Tunai Selepas Siap ditawarkan, bayar jumlah tepat kepada profesional selepas kerja siap — mereka rekod dalam aplikasi dan anda terima resit digital serta-merta. Jangan bayar di luar aplikasi.',
    },
    clauses: ['7.5', '7.20'],
  },
  {
    key: 'payment_escrow',
    topic: 'payment',
    q: ['escrow', 'when is the professional paid', 'is my money safe', 'wang selamat'],
    a: {
      en: 'Online payments are held by us rather than passed straight on, and released to your professional only after the job is complete — so nothing moves until the work is done.',
      ms: 'Pembayaran dalam talian dipegang oleh kami dan bukan terus diberikan, dan dilepaskan kepada profesional hanya selepas kerja siap.',
    },
    clauses: ['7.9'],
  },
  {
    key: 'payment_wallet',
    topic: 'payment',
    q: ['servisaku credit', 'wallet balance', 'my credit', 'baki kredit'],
    a: {
      en: 'ServisAku credit is applied before any other payment method at checkout. It has no cash value, is not transferable, and expires {{payment.credit_expiry_months}} months after issue unless a date is stated.',
      ms: 'Kredit ServisAku digunakan sebelum kaedah pembayaran lain semasa pembayaran. Ia tiada nilai tunai, tidak boleh dipindah milik, dan luput {{payment.credit_expiry_months}} bulan selepas dikeluarkan melainkan tarikh dinyatakan.',
    },
    clauses: ['29.3'],
  },
  {
    key: 'payment_coupon',
    topic: 'payment',
    q: ['coupon', 'promo code', 'voucher', 'discount code', 'kod promosi'],
    a: {
      en: 'Codes carry their own rules — minimum spend, category, expiry, one per customer and no stacking unless stated. If one will not apply, tell me the code and I will say exactly why.',
      ms: 'Setiap kod ada syaratnya — belanja minimum, kategori, tarikh luput, satu untuk setiap pelanggan. Jika kod tidak boleh digunakan, beritahu saya kodnya dan saya akan jelaskan sebabnya.',
    },
    clauses: ['10.9'],
  },
  {
    key: 'payment_invoice',
    topic: 'payment',
    q: ['invoice', 'receipt', 'tax invoice', 'resit'],
    a: {
      en: 'Every completed booking generates an invoice you can download from your booking history, itemising the service amount and SST separately.',
      ms: 'Setiap tempahan yang selesai menjana invois yang boleh dimuat turun dari sejarah tempahan, memperincikan jumlah perkhidmatan dan SST secara berasingan.',
    },
    clauses: ['7.10'],
  },
  {
    key: 'payment_sst',
    topic: 'payment',
    q: ['sst', 'tax', 'service tax', 'cukai'],
    a: {
      en: 'Service tax is charged at {{tax.sst_service_rate}} on taxable services, at the rate in force when you booked, and shown separately on your invoice.',
      ms: 'Cukai perkhidmatan dikenakan pada kadar {{tax.sst_service_rate}} untuk perkhidmatan bercukai, mengikut kadar semasa anda menempah, dan ditunjukkan berasingan pada invois.',
    },
    clauses: ['7.8'],
  },
  {
    key: 'payment_card_security',
    topic: 'payment',
    q: ['is my card safe', 'do you store my card', 'card details', 'kad selamat'],
    a: {
      en: 'Card numbers and CVV are entered on the gateway\'s own secure page and are never stored on our servers — if you save a card we keep only a gateway token and the masked digits.',
      ms: 'Nombor kad dan CVV dimasukkan pada halaman selamat gerbang pembayaran dan tidak pernah disimpan pada pelayan kami — jika anda menyimpan kad, kami simpan token dan digit bertopeng sahaja.',
    },
    clauses: ['7.3'],
  },
  {
    key: 'payment_failed_after_service',
    topic: 'payment',
    q: ['payment failed after service', 'owe money', 'unpaid booking', 'hutang'],
    a: {
      en: 'If a payment fails after the work is done you have {{payment.failed_settlement_days}} days from notice to settle it, and we may retry the saved method in the meantime.',
      ms: 'Jika pembayaran gagal selepas kerja siap, anda ada {{payment.failed_settlement_days}} hari dari notis untuk menjelaskannya.',
    },
    clauses: ['7.11'],
  },
  {
    key: 'payment_chargeback',
    topic: 'payment',
    q: ['chargeback', 'dispute with bank', 'reverse the charge', 'bantahan bank'],
    a: {
      en: 'Please talk to us before raising a chargeback with your bank — we can usually resolve it faster, and a chargeback for a service that was properly delivered can be recovered as a debt.',
      ms: 'Sila hubungi kami sebelum membuat bantahan dengan bank — kami biasanya boleh selesaikan lebih cepat.',
    },
    clauses: ['7.16'],
  },

  // ── Pricing ────────────────────────────────────────────────────────────────
  {
    key: 'pricing_how',
    topic: 'pricing',
    q: ['how is the price calculated', 'why this price', 'pricing', 'bagaimana harga'],
    a: {
      en: 'Well-defined services carry a fixed price; anything that depends on scope, area or condition is quoted as an estimate until a professional has seen it. The checkout price is what you pay for the scope booked.',
      ms: 'Perkhidmatan yang jelas mempunyai harga tetap; apa-apa yang bergantung pada skop, keluasan atau keadaan diberi anggaran sehingga profesional melihatnya.',
    },
    clauses: ['10.1', '10.2'],
  },
  {
    key: 'pricing_surge',
    topic: 'pricing',
    q: ['surge', 'why is it more expensive', 'peak pricing', 'harga naik'],
    a: {
      en: 'Prices can vary by time, demand, geography and public holidays. Any multiplier in effect is applied to the displayed price and is visible before you confirm — up to {{pricing.max_surge_multiplier}}x.',
      ms: 'Harga boleh berbeza mengikut masa, permintaan, kawasan dan cuti umum. Sebarang pengganda yang berkuat kuasa ditunjukkan sebelum anda sahkan — sehingga {{pricing.max_surge_multiplier}}x.',
    },
    clauses: ['10.6'],
  },
  {
    key: 'pricing_materials',
    topic: 'pricing',
    q: ['materials', 'parts', 'do i pay for parts', 'bahan'],
    a: {
      en: 'Unless the service description says otherwise the price covers labour and standard consumables only — parts, spares, paint and specialist chemicals are quoted and approved separately in the app.',
      ms: 'Melainkan penerangan perkhidmatan menyatakan sebaliknya, harga meliputi kerja dan bahan guna habis standard sahaja — alat ganti, cat dan bahan kimia khusus dipetik dan diluluskan berasingan.',
    },
    clauses: ['10.5'],
  },
  {
    key: 'pricing_inspection_fee',
    topic: 'pricing',
    q: ['inspection fee', 'call out fee', 'survey charge', 'yuran pemeriksaan'],
    a: {
      en: 'Diagnostic and survey visits can carry a call-out fee, disclosed before you book — and where the platform says so, it is credited against the final price if you go ahead with the work.',
      ms: 'Lawatan diagnostik dan tinjauan mungkin dikenakan yuran panggilan, dinyatakan sebelum anda menempah — dan jika platform menyatakan, ia dikreditkan pada harga akhir.',
    },
    clauses: ['10.3'],
  },
  {
    key: 'pricing_travel',
    topic: 'pricing',
    q: ['travel surcharge', 'outside coverage', 'far from you', 'surcaj perjalanan'],
    a: {
      en: 'Addresses at the edge of or outside standard coverage can carry a travel surcharge, as can access that materially adds time — no lift above a stated floor, restricted parking, island locations.',
      ms: 'Alamat di pinggir atau luar liputan standard mungkin dikenakan surcaj perjalanan, begitu juga akses yang menambah masa dengan ketara.',
    },
    clauses: ['10.7'],
  },
  {
    key: 'pricing_tips',
    topic: 'pricing',
    q: ['tip', 'tipping', 'can i tip', 'tip juruteknik'],
    a: {
      en: 'Tips are voluntary and never expected — a professional must not ask for one or make the work conditional on it.',
      ms: 'Tip adalah sukarela dan tidak pernah dijangka — profesional tidak boleh memintanya atau menjadikan kerja bersyarat kepadanya.',
    },
    clauses: ['10.12'],
  },

  // ── Refund & cancellation ──────────────────────────────────────────────────
  {
    key: 'refund_policy',
    topic: 'refund',
    q: ['refund policy', 'cancellation policy', 'get my money back', 'dasar bayaran balik', 'polisi pembatalan'],
    a: {
      en: 'You can cancel free of charge more than {{cancellation.free_window_hours}} hours before the start and get a full refund. Inside that window a cancellation fee applies, between {{cancellation.fee_min_myr}} and {{cancellation.fee_max_myr}} for standard bookings. If your professional does not turn up you are refunded in full regardless of notice.',
      ms: 'Anda boleh membatalkan secara percuma lebih {{cancellation.free_window_hours}} jam sebelum mula dan menerima bayaran balik penuh. Dalam tempoh itu, yuran pembatalan antara {{cancellation.fee_min_myr}} dan {{cancellation.fee_max_myr}} dikenakan.',
    },
    clauses: ['8.1', '8.2', '9.1'],
  },
  {
    key: 'refund_timing',
    topic: 'refund',
    q: ['how long does a refund take', 'when will i get my refund', 'refund not received', 'bila bayaran balik'],
    a: {
      en: 'Approved refunds are initiated within {{refund.initiation_business_days}} business days and usually reach you in {{refund.processing_days_min}} to {{refund.processing_days_max}} working days, depending on your bank.',
      ms: 'Bayaran balik yang diluluskan dimulakan dalam {{refund.initiation_business_days}} hari bekerja dan biasanya sampai dalam {{refund.processing_days_min}} hingga {{refund.processing_days_max}} hari bekerja.',
    },
    clauses: ['9.4'],
  },
  {
    key: 'refund_method',
    topic: 'refund',
    q: ['where does the refund go', 'refund to card', 'closed card', 'ke mana bayaran balik'],
    a: {
      en: 'Refunds go back to the original payment method. If that is gone — expired or closed — we issue ServisAku credit or transfer to a verified account in your own name.',
      ms: 'Bayaran balik dikembalikan ke kaedah pembayaran asal. Jika ia tiada lagi, kami keluarkan kredit ServisAku atau pindahkan ke akaun yang disahkan atas nama anda.',
    },
    clauses: ['9.4', '9.5'],
  },
  {
    key: 'refund_cash_booking',
    topic: 'refund',
    q: ['refund for cash booking', 'paid cash refund', 'bayaran balik tunai'],
    a: {
      en: 'For a booking paid in cash, a refund is issued as ServisAku credit or by transfer to a bank account in your own name, once we have verified the account holder.',
      ms: 'Untuk tempahan yang dibayar tunai, bayaran balik dikeluarkan sebagai kredit ServisAku atau pindahan ke akaun bank atas nama anda.',
    },
    clauses: ['9.5'],
  },
  {
    key: 'refund_not_due',
    topic: 'refund',
    q: ['when is no refund given', 'non refundable', 'why no refund', 'tiada bayaran balik'],
    a: {
      en: 'No refund is due if you were a no-show or refused access, if the work met the agreed standard and you changed your mind, if the issue was a pre-existing condition you did not disclose, or if the booking was arranged off-platform.',
      ms: 'Tiada bayaran balik jika anda tidak hadir atau menolak akses, jika kerja memenuhi standard dan anda berubah fikiran, atau jika tempahan diuruskan di luar platform.',
    },
    clauses: ['9.3'],
  },
  {
    key: 'refund_dispute',
    topic: 'refund',
    q: ['flag job', 'raise a dispute', 'unhappy with the work', 'tidak puas hati'],
    a: {
      en: 'Use Flag Job on the booking to raise a dispute — the disputed amount is frozen and no payout is released while we investigate using the job record, photos, chat and both accounts.',
      ms: 'Gunakan Flag Job pada tempahan untuk membangkitkan pertikaian — jumlah yang dipertikaikan dibekukan sementara kami menyiasat.',
    },
    clauses: ['9.6', '9.7'],
  },

  // ── Quality & damage ───────────────────────────────────────────────────────
  {
    key: 'quality_guarantee',
    topic: 'quality',
    q: ['service guarantee', 'not happy with the work', 'redo the job', 'jaminan perkhidmatan'],
    a: {
      en: 'If the work is not to the standard a competent professional would deliver, tell us within the complaint window and we will arrange a re-do, a refund or a credit — our choice, at no extra cost to you.',
      ms: 'Jika kerja tidak mencapai standard, beritahu kami dalam tempoh aduan dan kami akan aturkan kerja semula, bayaran balik atau kredit tanpa kos tambahan.',
    },
    clauses: ['28.1'],
  },
  {
    key: 'quality_warranty',
    topic: 'quality',
    q: ['warranty', 'guarantee period', 'workmanship', 'jaminan kerja'],
    a: {
      en: 'Workmanship on repair, installation, carpentry, plumbing, electrical, painting and waterproofing is guaranteed for at least {{warranty.workmanship_days}} days from completion. Parts carry the manufacturer\'s warranty instead.',
      ms: 'Mutu kerja untuk pembaikan, pemasangan, pertukangan, paip, elektrik, cat dan kalis air dijamin sekurang-kurangnya {{warranty.workmanship_days}} hari dari siap. Alat ganti mengikut jaminan pengeluar.',
    },
    clauses: ['28.2'],
  },
  {
    key: 'quality_exclusions',
    topic: 'quality',
    q: ['what is not covered', 'exclusions', 'guarantee exclusions', 'tidak dilindungi'],
    a: {
      en: 'The guarantee does not cover pre-existing conditions, fair wear and tear, materials you supplied, work you or someone else altered afterwards, or an outcome the professional warned in writing was not achievable.',
      ms: 'Jaminan tidak meliputi keadaan sedia ada, haus dan lusuh, bahan yang anda bekalkan, kerja yang diubah selepas itu, atau hasil yang profesional beritahu secara bertulis tidak boleh dicapai.',
    },
    clauses: ['28.4'],
  },
  {
    key: 'damage_claim',
    topic: 'damage',
    q: ['damaged', 'broke something', 'damage claim', 'compensation', 'rosak'],
    a: {
      en: 'Report damage from the booking within {{damage.reporting_window_hours}} hours of the job finishing, with at least {{damage.min_evidence_photos}} photo and the repair or replacement cost. We acknowledge within {{damage.sla_acknowledge_hours}} hours and give the professional {{damage.sla_partner_response_hours}} hours to respond.',
      ms: 'Laporkan kerosakan dari tempahan dalam {{damage.reporting_window_hours}} jam selepas kerja siap, dengan sekurang-kurangnya {{damage.min_evidence_photos}} gambar dan kos pembaikan. Kami mengakui dalam {{damage.sla_acknowledge_hours}} jam.',
    },
    clauses: ['20.10'],
  },
  {
    key: 'damage_valuables',
    topic: 'damage',
    q: ['valuables', 'jewellery', 'cash at home', 'barang berharga'],
    a: {
      en: 'Please secure or remove cash, jewellery, documents, medication and anything fragile or irreplaceable before the booking — cover for items left in the open is limited, and none is offered for cash.',
      ms: 'Sila simpan atau alihkan wang tunai, barang kemas, dokumen, ubat dan barang rapuh sebelum tempahan — perlindungan untuk barang yang dibiarkan terbuka adalah terhad.',
    },
    clauses: ['12.7'],
  },

  // ── Trust & safety ─────────────────────────────────────────────────────────
  {
    key: 'trust_verification',
    topic: 'trust',
    q: ['are professionals verified', 'background check', 'is it safe', 'trust', 'disahkan'],
    a: {
      en: 'Every professional completes MyKad identity verification, background screening through CTOS, and category competency checks before taking any booking, and is re-screened every {{partner.reverification_months}} months.',
      ms: 'Setiap profesional melengkapkan pengesahan identiti MyKad, saringan latar belakang melalui CTOS dan pemeriksaan kecekapan kategori sebelum menerima tempahan, dan disaring semula setiap {{partner.reverification_months}} bulan.',
    },
    clauses: ['4.3'],
  },
  {
    key: 'trust_insurance',
    topic: 'trust',
    q: ['insurance', 'are they insured', 'liability cover', 'insurans'],
    a: {
      en: 'Professionals must hold public liability insurance covering third-party property damage and injury, and provide evidence on request. Our own insurance is for us and does not cover you directly.',
      ms: 'Profesional mesti memegang insurans liabiliti awam yang meliputi kerosakan harta pihak ketiga dan kecederaan.',
    },
    clauses: ['11.5', '20.11'],
  },
  {
    key: 'trust_sos',
    topic: 'trust',
    q: ['sos', 'emergency button', 'feel unsafe', 'butang kecemasan'],
    a: {
      en: 'The app has an SOS control that alerts our operations team with your location and booking, and you can share a live tracking link with someone you trust. In a real emergency call 999 first — we are not an emergency service.',
      ms: 'Aplikasi mempunyai kawalan SOS yang memberi amaran kepada pasukan operasi kami dengan lokasi dan tempahan anda. Dalam kecemasan sebenar, hubungi 999 dahulu.',
    },
    clauses: ['19.2', '19.3'],
  },
  {
    key: 'trust_privacy',
    topic: 'trust',
    q: ['privacy', 'my data', 'pdpa', 'data peribadi'],
    a: {
      en: 'We process personal data under the Personal Data Protection Act 2010. Your phone number and full address are masked from professionals until shortly before the booking, and chat and calls run through masked channels.',
      ms: 'Kami memproses data peribadi di bawah Akta Perlindungan Data Peribadi 2010. Nombor telefon dan alamat penuh anda dilindungi daripada profesional sehingga hampir waktu tempahan.',
    },
    clauses: ['18.2', '18.6'],
  },
  {
    key: 'trust_off_platform',
    topic: 'trust',
    q: ['pay outside the app', 'hire directly', 'off platform', 'bayar luar aplikasi'],
    a: {
      en: 'Please keep everything on the platform. A job arranged or paid outside it has no escrow, no service guarantee and no dispute process — and engaging a professional directly after meeting them here breaches the terms.',
      ms: 'Sila kekalkan semuanya dalam platform. Kerja yang diatur atau dibayar di luar tiada escrow, tiada jaminan perkhidmatan dan tiada proses pertikaian.',
    },
    clauses: ['7.19', '7.20', '12.14'],
  },

  // ── Account ────────────────────────────────────────────────────────────────
  {
    key: 'account_signup',
    topic: 'account',
    q: ['create an account', 'sign up', 'register', 'daftar'],
    a: {
      en: 'You need a Malaysian mobile number that can receive a one-time passcode, plus your name and email. You must be 18 or over to book.',
      ms: 'Anda perlukan nombor telefon bimbit Malaysia yang boleh menerima kod sekali guna, serta nama dan e-mel. Anda mesti berumur 18 tahun ke atas.',
    },
    clauses: ['4.1', '5.1'],
  },
  {
    key: 'account_otp_security',
    topic: 'account',
    q: ['otp security', 'someone asked for my otp', 'share code', 'kod otp'],
    a: {
      en: 'Never share a one-time passcode with anyone, including someone claiming to be from ServisAku. We will never ask you for an OTP, a password or full card details by phone, chat, SMS or email.',
      ms: 'Jangan sekali-kali kongsi kod sekali guna dengan sesiapa, termasuk orang yang mendakwa dari ServisAku. Kami tidak akan meminta OTP, kata laluan atau butiran kad penuh.',
    },
    clauses: ['5.2'],
  },
  {
    key: 'account_multiple',
    topic: 'account',
    q: ['two accounts', 'multiple accounts', 'second account', 'akaun kedua'],
    a: {
      en: 'One customer account per person. Creating extra accounts to claim new-user offers or evade a restriction lets us merge or close them and reverse any benefit obtained.',
      ms: 'Satu akaun pelanggan bagi setiap orang. Mencipta akaun tambahan untuk menuntut tawaran pengguna baharu membolehkan kami menggabung atau menutupnya.',
    },
    clauses: ['5.7'],
  },
  {
    key: 'account_close',
    topic: 'account',
    q: ['delete my account', 'close account', 'tutup akaun'],
    a: {
      en: 'You can close your account from Settings once every booking is completed or cancelled and nothing is outstanding. Booking and financial records are kept for {{retention.financial_records_years}} years afterwards for tax and regulatory reasons.',
      ms: 'Anda boleh menutup akaun dari Tetapan setelah semua tempahan selesai dan tiada tunggakan. Rekod tempahan dan kewangan disimpan {{retention.financial_records_years}} tahun selepas itu.',
    },
    clauses: ['5.11', '18.11', '24.8'],
  },

  // ── Legal ──────────────────────────────────────────────────────────────────
  {
    key: 'legal_terms_change',
    topic: 'legal',
    q: ['terms changed', 'new terms', 'update to terms', 'terma berubah'],
    a: {
      en: 'We give at least {{legal.material_change_notice_days}} days\' notice before a material change to fees, cancellation, refunds or liability takes effect, and a change never applies retrospectively to a booking already confirmed.',
      ms: 'Kami memberi notis sekurang-kurangnya {{legal.material_change_notice_days}} hari sebelum perubahan material berkuat kuasa, dan perubahan tidak berkuat kuasa ke belakang untuk tempahan yang telah disahkan.',
    },
    clauses: ['25.2', '25.5'],
  },
  {
    key: 'legal_complaint_route',
    topic: 'legal',
    q: ['make a complaint', 'escalate', 'appeal a decision', 'buat aduan'],
    a: {
      en: 'Raise it in the app first. If you disagree with an outcome you can ask for an internal review within {{partner.appeal_window_days}} days, and it is handled by someone who was not the original decision-maker.',
      ms: 'Bangkitkan dalam aplikasi dahulu. Jika anda tidak bersetuju dengan keputusan, anda boleh meminta semakan dalaman dalam {{partner.appeal_window_days}} hari.',
    },
    clauses: ['23.1', '23.2'],
  },
  {
    key: 'legal_consumer_rights',
    topic: 'legal',
    q: ['consumer rights', 'tribunal', 'statutory rights', 'hak pengguna'],
    a: {
      en: 'Nothing in our terms takes away rights you have under the Consumer Protection Act 1999, and you can always bring a claim to the Tribunal for Consumer Claims Malaysia.',
      ms: 'Tiada apa-apa dalam terma kami menghilangkan hak anda di bawah Akta Perlindungan Pengguna 1999, dan anda sentiasa boleh membawa tuntutan ke Tribunal Tuntutan Pengguna Malaysia.',
    },
    clauses: ['9.11', '23.6', '32.1'],
  },
];
