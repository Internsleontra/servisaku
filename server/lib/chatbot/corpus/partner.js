// ─────────────────────────────────────────────────────────────────────────────
// Partner knowledge corpus.
//
// Same two rules as the consumer corpus: no business number written as a
// literal, and every answer authored in English and Bahasa Malaysia.
// See corpus/consumer.js.
//
// One additional rule specific to this audience: nothing here may suggest a way
// to take a booking, a customer or a payment off the platform. Partner Terms
// 7.19 makes that a material breach, and an assistant that helpfully explains
// the workaround is the worst possible place for it to be explained.
// ─────────────────────────────────────────────────────────────────────────────

export const PARTNER_CORPUS = [
  // ── Earnings & payouts ─────────────────────────────────────────────────────
  {
    key: 'partner_payouts',
    topic: 'earnings',
    q: ['when do i get paid', 'payout', 'earnings', 'bayaran', 'bila dapat duit'],
    a: {
      en: 'Earnings move into your wallet once a job is complete and escrow releases. Payout runs are {{payout.frequency}}, and funds normally reach your bank within {{payout.settlement_days_max}} working days.',
      ms: 'Pendapatan masuk ke dompet anda sebaik kerja siap dan escrow dilepaskan. Pusingan bayaran adalah {{payout.frequency}}, dan dana biasanya sampai dalam {{payout.settlement_days_max}} hari bekerja.',
    },
    clauses: ['7.13'],
  },
  {
    key: 'partner_payout_requirements',
    topic: 'earnings',
    q: ['why was i not paid', 'not in payout run', 'missed payout', 'tak masuk bayaran'],
    a: {
      en: 'To be included in a run you need verified bank details on file and a balance above the minimum. A payout can also be held while a dispute or investigation is open, or while you owe an outstanding amount.',
      ms: 'Untuk dimasukkan dalam pusingan, anda perlukan butiran bank yang disahkan dan baki melebihi minimum. Bayaran juga boleh ditahan semasa pertikaian atau siasatan dibuka.',
    },
    clauses: ['7.14'],
  },
  {
    key: 'partner_bank',
    topic: 'earnings',
    q: ['bank details', 'change my bank', 'bank not verified', 'tukar bank'],
    a: {
      en: 'Update your bank details from the Bank Details screen. Any change resets verification while we re-check the account name against your verified identity, so change it well ahead of a payout rather than on the day.',
      ms: 'Kemas kini butiran bank dari skrin Butiran Bank. Sebarang perubahan menetapkan semula pengesahan, jadi ubah lebih awal daripada hari bayaran.',
    },
  },
  {
    key: 'partner_escrow',
    topic: 'earnings',
    q: ['pending balance', 'why is my money pending', 'escrow release', 'baki tertunda'],
    a: {
      en: 'Money sits as pending while the booking is in escrow, and becomes available once the customer confirms or the confirmation window passes without a dispute.',
      ms: 'Wang kekal tertunda semasa tempahan dalam escrow, dan menjadi tersedia sebaik pelanggan mengesahkan atau tempoh pengesahan berlalu tanpa pertikaian.',
    },
    clauses: ['7.9'],
  },
  {
    key: 'partner_earnings_statement',
    topic: 'earnings',
    q: ['earnings statement', 'export earnings', 'statement for tax', 'penyata pendapatan'],
    a: {
      en: 'Every payout comes with an itemised statement showing booking value, commission, deductions and net. You can export a date range as CSV from Earnings.',
      ms: 'Setiap bayaran disertakan penyata terperinci menunjukkan nilai tempahan, komisen, potongan dan bersih. Anda boleh eksport julat tarikh sebagai CSV.',
    },
    clauses: ['7.10'],
  },

  // ── Commission ─────────────────────────────────────────────────────────────
  {
    key: 'partner_commission',
    topic: 'commission',
    q: ['commission', 'how much do you take', 'komisen', 'berapa potongan'],
    a: {
      en: 'The platform commission is {{commission.rate.default}} of booking value at the default tier, set by category and tier. A rate change never applies to a job you have already accepted.',
      ms: 'Komisen platform ialah {{commission.rate.default}} daripada nilai tempahan pada tahap lalai. Perubahan kadar tidak sekali-kali dikenakan pada kerja yang telah anda terima.',
    },
    clauses: ['7.6'],
  },
  {
    key: 'partner_cash_commission',
    topic: 'commission',
    q: ['cash job', 'took cash', 'cash commission', 'outstanding balance', 'kerja tunai'],
    a: {
      en: 'On a cash job you keep the full fare, so the commission becomes an amount you owe back. Record the cash in the app as soon as the job is done — it goes onto your outstanding balance and settles {{commission.settlement_period}}.',
      ms: 'Pada kerja tunai anda menyimpan tambang penuh, jadi komisen menjadi jumlah yang anda hutang. Rekod tunai dalam aplikasi sebaik kerja siap — ia masuk ke baki tertunggak dan diselesaikan {{commission.settlement_period}}.',
    },
    clauses: ['7.5'],
  },
  {
    key: 'partner_cash_trust',
    topic: 'commission',
    q: ['why do i owe commission on cash', 'cash held on trust', 'kenapa hutang komisen'],
    a: {
      en: 'Cash you collect is partly received as our agent — the commission portion is held on trust for ServisAku and must not be used for your own purposes, which is why it appears as a debt rather than earnings.',
      ms: 'Tunai yang anda kutip sebahagiannya diterima sebagai ejen kami — bahagian komisen dipegang sebagai amanah untuk ServisAku dan tidak boleh digunakan untuk tujuan anda sendiri.',
    },
    clauses: ['7.5'],
  },
  {
    key: 'partner_frozen',
    topic: 'commission',
    q: ['no new jobs', 'account paused', 'not receiving jobs', 'frozen', 'overdue', 'tiada job baru'],
    a: {
      en: 'If a settlement goes unpaid past its due date you get reminders, then new offers pause after {{partner.freeze_after_days}} days and payouts hold after {{partner.suspend_payouts_after_days}}. Jobs already accepted are never affected, and clearing it restores both.',
      ms: 'Jika penyelesaian tidak dibayar melepasi tarikh akhir, anda menerima peringatan, kemudian tawaran baharu terhenti selepas {{partner.freeze_after_days}} hari dan bayaran ditahan selepas {{partner.suspend_payouts_after_days}}.',
    },
  },
  {
    key: 'partner_settle',
    topic: 'commission',
    q: ['how do i settle', 'pay commission', 'clear my balance', 'jelaskan komisen'],
    a: {
      en: 'Settle from your Wallet — either online, or straight from your available balance if there is enough in it.',
      ms: 'Jelaskan dari Dompet anda — sama ada dalam talian, atau terus dari baki tersedia jika mencukupi.',
    },
  },
  {
    key: 'partner_set_off',
    topic: 'commission',
    q: ['deducted from payout', 'set off', 'why less than expected', 'kenapa kurang'],
    a: {
      en: 'We can set off what you owe against what we owe you, so an outstanding settlement is deducted from the next payout. The statement itemises every deduction.',
      ms: 'Kami boleh menolak jumlah hutang anda daripada jumlah yang kami hutang, jadi penyelesaian tertunggak ditolak daripada bayaran seterusnya.',
    },
    clauses: ['7.15'],
  },
  {
    key: 'partner_tax',
    topic: 'commission',
    q: ['tax', 'income tax', 'socso', 'epf', 'do you deduct tax', 'cukai'],
    a: {
      en: 'You are an independent contractor, so income tax, SOCSO and EPF are yours to handle — we deduct none of them. If your taxable turnover crosses the service tax threshold you must register and account for it yourself.',
      ms: 'Anda adalah kontraktor bebas, jadi cukai pendapatan, SOCSO dan KWSP adalah tanggungjawab anda — kami tidak memotong mana-mana.',
    },
    clauses: ['7.8', '11.1'],
  },

  // ── Jobs ───────────────────────────────────────────────────────────────────
  {
    key: 'partner_accept_window',
    topic: 'jobs',
    q: ['how long to accept', 'offer expired', 'dispatch window', 'masa terima job'],
    a: {
      en: 'You have {{booking.dispatch_accept_minutes}} minutes to accept a dispatched job before it goes to the next professional.',
      ms: 'Anda ada {{booking.dispatch_accept_minutes}} minit untuk menerima kerja sebelum ia dihantar kepada profesional seterusnya.',
    },
    clauses: ['6.5'],
  },
  {
    key: 'partner_cancel_job',
    topic: 'jobs',
    q: ['cancel a job', 'cannot make it', 'decline after accepting', 'batalkan kerja'],
    a: {
      en: 'Cancel only for good cause — illness, an emergency, a breakdown, an unsafe address or a scope materially different from the booking. Cancel through the app as early as you can and state the reason; late cancellations count against your reliability metrics.',
      ms: 'Batalkan hanya atas sebab yang munasabah — sakit, kecemasan, kerosakan kenderaan, alamat tidak selamat. Batalkan melalui aplikasi seawal mungkin dan nyatakan sebabnya.',
    },
    clauses: ['8.5'],
  },
  {
    key: 'partner_customer_noshow',
    topic: 'jobs',
    q: ['customer not home', 'nobody answering', 'no access', 'pelanggan tiada'],
    a: {
      en: 'Wait the {{booking.arrival_grace_minutes}}-minute grace period and try contacting them through the app — that call is logged, which matters if this becomes a no-show claim. Then mark it as a customer no-show from the job screen with a photo.',
      ms: 'Tunggu tempoh tangguh {{booking.arrival_grace_minutes}} minit dan cuba hubungi melalui aplikasi — panggilan itu direkodkan.',
    },
    clauses: ['6.14', '6.15'],
  },
  {
    key: 'partner_evidence',
    topic: 'jobs',
    q: ['completion photos', 'job evidence', 'why do i need photos', 'gambar siap'],
    a: {
      en: 'Upload the required completion evidence before you mark a job done — at minimum one completion photo, and for cleaning categories before, during and after. Photos must be genuine, contemporaneous and of the actual address; recycled or edited images mean immediate removal.',
      ms: 'Muat naik bukti siap sebelum menandakan kerja selesai — sekurang-kurangnya satu gambar, dan untuk kategori pembersihan sebelum, semasa dan selepas. Gambar mesti tulen dan dari alamat sebenar.',
    },
    clauses: ['11.18'],
  },
  {
    key: 'partner_scope_change',
    topic: 'jobs',
    q: ['job is bigger than booked', 'extra work on site', 'quote additional', 'kerja lebih besar'],
    a: {
      en: 'Stop, explain, and quote the additional work through the app for the customer to approve before you do it. Work carried out without in-app approval is at your own risk and we are under no obligation to collect payment for it.',
      ms: 'Berhenti, terangkan dan berikan sebut harga kerja tambahan melalui aplikasi untuk kelulusan pelanggan sebelum anda melakukannya.',
    },
    clauses: ['6.17', '10.4'],
  },
  {
    key: 'partner_communication',
    topic: 'jobs',
    q: ['contact the customer', 'call customer', 'masked number', 'hubungi pelanggan'],
    a: {
      en: 'Contact customers only through the app\'s chat and masked calling. Do not use personal channels, do not keep their details after the job, and never use them for marketing.',
      ms: 'Hubungi pelanggan hanya melalui sembang dan panggilan bertopeng dalam aplikasi. Jangan gunakan saluran peribadi atau simpan butiran mereka selepas kerja.',
    },
    clauses: ['11.11'],
  },
  {
    key: 'partner_subcontract',
    topic: 'jobs',
    q: ['send someone else', 'subcontract', 'my helper', 'hantar orang lain'],
    a: {
      en: 'You must not send anyone else in your place without our prior approval. Where a crew is approved, every member is individually registered, screened and named on the job — and you stay fully responsible for them.',
      ms: 'Anda tidak boleh menghantar orang lain tanpa kelulusan kami terlebih dahulu. Jika kru diluluskan, setiap ahli didaftar dan disaring secara individu.',
    },
    clauses: ['11.17'],
  },
  {
    key: 'partner_safety_refuse',
    topic: 'jobs',
    q: ['unsafe job', 'can i refuse', 'dangerous site', 'kerja bahaya'],
    a: {
      en: 'You can stop and leave at any point where safety is at risk, and you should. Do a visual risk assessment on arrival, isolate before working on electrics or water, and refuse anything that cannot be done safely or lawfully.',
      ms: 'Anda boleh berhenti dan pergi bila-bila masa keselamatan terjejas. Buat penilaian risiko visual semasa tiba dan asingkan bekalan sebelum bekerja pada elektrik atau air.',
    },
    clauses: ['11.6', '19.4'],
  },
  {
    key: 'partner_harassment',
    topic: 'jobs',
    q: ['customer was abusive', 'harassed', 'uncomfortable', 'pelanggan kasar'],
    a: {
      en: 'You do not have to stay. Leave, and report it through the app immediately — abuse, harassment or an unsafe demand from a customer ends the booking without refund and goes to our trust and safety team.',
      ms: 'Anda tidak perlu kekal. Pergi dan laporkan melalui aplikasi dengan segera — penderaan atau gangguan daripada pelanggan menamatkan tempahan tanpa bayaran balik.',
    },
    clauses: ['12.9'],
  },

  // ── Verification & standing ────────────────────────────────────────────────
  {
    key: 'partner_verification',
    topic: 'verification',
    q: ['verification', 'onboarding', 'what documents', 'pengesahan'],
    a: {
      en: 'Onboarding needs identity verification against MyKad or passport, background screening through CTOS, bank account verification, and the licences and competency certificates your categories require.',
      ms: 'Onboarding memerlukan pengesahan identiti MyKad atau pasport, saringan latar belakang CTOS, pengesahan akaun bank, dan lesen serta sijil kecekapan untuk kategori anda.',
    },
    clauses: ['4.3'],
  },
  {
    key: 'partner_licences',
    topic: 'verification',
    q: ['licence', 'certificate', 'suruhanjaya tenaga', 'cidb', 'lesen'],
    a: {
      en: 'You must hold and keep current every licence your categories require — Energy Commission registration for electrical work, Ministry of Health or local authority licensing for pest control, CIDB where construction work applies — and must not accept a job in a category you are not licensed for.',
      ms: 'Anda mesti memegang dan mengekalkan setiap lesen yang diperlukan kategori anda — pendaftaran Suruhanjaya Tenaga untuk kerja elektrik, pelesenan KKM untuk kawalan perosak, CIDB untuk kerja pembinaan.',
    },
    clauses: ['4.3', '11.4'],
  },
  {
    key: 'partner_insurance',
    topic: 'verification',
    q: ['do i need insurance', 'public liability', 'insurans'],
    a: {
      en: 'Yes — public liability insurance covering third-party property damage and injury, at your own cost, plus employer liability and SOCSO cover for anyone you engage. It must stay current or dispatch stops.',
      ms: 'Ya — insurans liabiliti awam meliputi kerosakan harta pihak ketiga dan kecederaan, atas kos anda sendiri, serta liabiliti majikan dan SOCSO untuk sesiapa yang anda ambil bekerja.',
    },
    clauses: ['11.5'],
  },
  {
    key: 'partner_reverification',
    topic: 'verification',
    q: ['re-verification', 'annual check', 'screened again', 'saringan semula'],
    a: {
      en: 'Background screening is repeated every {{partner.reverification_months}} months, and you must tell us immediately of any charge, conviction, licence revocation or bankruptcy that would affect your eligibility.',
      ms: 'Saringan latar belakang diulang setiap {{partner.reverification_months}} bulan, dan anda mesti memberitahu kami dengan segera tentang sebarang pertuduhan, sabitan atau pembatalan lesen.',
    },
    clauses: ['4.3'],
  },
  {
    key: 'partner_documents',
    topic: 'verification',
    q: ['upload documents', 'document rejected', 'muat naik dokumen'],
    a: {
      en: 'Upload from Profile → Documents as JPG, PNG or PDF. Make sure the expiry date is readable — an unreadable date is the most common reason a document comes back.',
      ms: 'Muat naik dari Profil → Dokumen sebagai JPG, PNG atau PDF. Pastikan tarikh luput boleh dibaca.',
    },
  },

  // ── Standing & conduct ─────────────────────────────────────────────────────
  {
    key: 'partner_ratings',
    topic: 'ratings',
    q: ['my rating', 'improve rating', 'star rating', 'penilaian saya'],
    a: {
      en: 'Your displayed rating weights recent jobs more heavily, so it recovers faster than it falls. Ratings below {{partner.quality_review_rating}} stars generate an internal quality review.',
      ms: 'Penilaian anda memberatkan kerja terkini, jadi ia pulih lebih cepat daripada jatuh. Penilaian di bawah {{partner.quality_review_rating}} bintang menjana semakan kualiti dalaman.',
    },
    clauses: ['14.2', '14.4'],
  },
  {
    key: 'partner_review_removal',
    topic: 'ratings',
    q: ['remove a review', 'unfair review', 'buang ulasan'],
    a: {
      en: 'Reviews are not removed for being negative — only where they are not based on a real booking, contain personal data, are abusive or discriminatory, or are retaliatory. You can post a factual, non-abusive reply to any review.',
      ms: 'Ulasan tidak dibuang kerana negatif — hanya jika bukan berdasarkan tempahan sebenar, mengandungi data peribadi, kesat atau balas dendam. Anda boleh membalas secara fakta.',
    },
    clauses: ['14.3', '14.5'],
  },
  {
    key: 'partner_penalties',
    topic: 'standing',
    q: ['penalty', 'warning', 'performance management', 'penalti'],
    a: {
      en: 'We use a graduated response — a warning, re-training, reduced dispatch priority, a monetary penalty proportionate to the loss, loss of tier status, suspension, and removal. Penalties come with reasons and can be appealed.',
      ms: 'Kami menggunakan tindakan berperingkat — amaran, latihan semula, keutamaan penghantaran dikurangkan, penalti kewangan, kehilangan status tahap, penggantungan dan penyingkiran.',
    },
    clauses: ['11.19'],
  },
  {
    key: 'partner_removal_grounds',
    topic: 'standing',
    q: ['permanently removed', 'banned', 'immediate removal', 'disingkir'],
    a: {
      en: 'Immediate permanent removal applies to violence or threats, sexual harassment or misconduct, theft, a weapon or illegal substance at an address, attending intoxicated, fabricated completion evidence, identity fraud, or systematic off-platform diversion.',
      ms: 'Penyingkiran kekal serta-merta terpakai untuk keganasan atau ancaman, gangguan seksual, kecurian, senjata atau bahan haram, hadir dalam keadaan mabuk, bukti siap palsu atau penipuan identiti.',
    },
    clauses: ['11.20'],
  },
  {
    key: 'partner_appeal',
    topic: 'standing',
    q: ['appeal', 'suspended unfairly', 'review decision', 'rayuan'],
    a: {
      en: 'Ask for an internal review within {{partner.appeal_window_days}} days. It is handled by someone who was not the original decision-maker, and any decision made or supported by an automated system gets a human review on request.',
      ms: 'Minta semakan dalaman dalam {{partner.appeal_window_days}} hari. Ia dikendalikan oleh orang yang bukan pembuat keputusan asal.',
    },
    clauses: ['23.2'],
  },
  {
    key: 'partner_off_platform',
    topic: 'standing',
    q: ['customer wants to pay directly', 'take job outside', 'private deal', 'bayar terus'],
    a: {
      en: 'I cannot help with that. Taking a platform-originated booking off-platform is a material breach — we can recover the commission, add a penalty of up to three times it, and suspend both accounts. Keeping it in the app is also what keeps your payout protection and dispute cover.',
      ms: 'Saya tidak boleh membantu dengan itu. Membawa tempahan keluar dari platform adalah pelanggaran material — kami boleh menuntut semula komisen dan mengenakan penalti sehingga tiga kali ganda.',
    },
    clauses: ['7.19'],
  },
  {
    key: 'partner_independent',
    topic: 'standing',
    q: ['am i an employee', 'employment status', 'pekerja atau tidak'],
    a: {
      en: 'You are an independent contractor, not an employee. You set your own hours and availability, provide your own tools and transport, and are free to work with other platforms — there is no minimum wage, leave or termination benefit from us.',
      ms: 'Anda adalah kontraktor bebas, bukan pekerja. Anda menetapkan waktu dan ketersediaan sendiri, menyediakan alat dan pengangkutan sendiri.',
    },
    clauses: ['11.1'],
  },
];
