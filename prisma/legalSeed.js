// Seeds v1.0 of the six legal documents.
//
// IMPORTANT: this is drafting scaffolding, not legal advice. The text is
// written to match what the platform actually does — the tiered refund policy
// in server/lib/refunds/policy.js, the 48h damage window and liability split in
// server/lib/damageClaims/sla.js, the commission settlement rules in
// server/lib/wallet/ — so a lawyer is reviewing accurate behaviour rather than
// boilerplate. It MUST be reviewed by Malaysian counsel before launch, and the
// placeholders below must be filled in.
//
//   node prisma/legalSeed.js            # create drafts
//   node prisma/legalSeed.js --publish  # create and publish
//
// Idempotent — existing (slug, version) pairs are left alone.
import 'dotenv/config';
import { prisma } from '../server/db.js';
import { publish } from '../server/lib/legal/index.js';

const PUBLISH = process.argv.includes('--publish');
const COMPANY = process.env.LEGAL_COMPANY_NAME || 'ServisAku Sdn Bhd';
const COMPANY_NO = process.env.LEGAL_COMPANY_NO || '[COMPANY REGISTRATION NO]';
const ADDRESS = process.env.LEGAL_ADDRESS || '[REGISTERED ADDRESS]';
const CONTACT = process.env.LEGAL_CONTACT_EMAIL || 'support@servisaku.my';
const EFFECTIVE = new Date('2026-08-01T00:00:00+08:00');

const header = (title) => `# ${title}

**${COMPANY}** (Company No. ${COMPANY_NO})
${ADDRESS}

**Version 1.0 · Effective 1 August 2026**

`;

const DOCS = [
  {
    slug: 'customer_terms', audience: 'consumer',
    title: 'Customer Terms of Service', titleMy: 'Terma Perkhidmatan Pelanggan',
    contentMd: `${header('Customer Terms of Service')}## 1. Who we are

ServisAku operates a platform that connects customers with independent service professionals ("Partners"). We are not the provider of the services themselves; Partners perform them.

## 2. Booking a service

When you confirm a booking you enter into an agreement with us to arrange the service, and with the Partner for its performance. The price shown at checkout is the price you pay, including Service Tax (SST) where applicable.

## 3. Payment

You may pay online (FPX, DuitNow, card, or e-wallet) or in cash directly to the Partner on completion.

Online payments are held in escrow and released to the Partner after the service is complete. Cash payments are recorded in the app by the Partner and a receipt is issued to you.

## 4. Cancellation and refunds

Refunds follow our Cancellation Policy and Refund Policy, which form part of these terms. In summary, the amount refunded depends on the notice you give:

- more than 48 hours before the booking — 100%
- 4 to 48 hours before — 75%
- less than 4 hours before — 50%
- after a Partner has accepted — 50%

If a Partner does not attend, you are refunded in full.

## 5. Your responsibilities

You agree to provide safe and lawful access to the premises, accurate information about the job, and to treat Partners with respect. You are responsible for securing valuables and pets before a Partner arrives.

## 6. Damage

If a Partner damages your property, our Damage Policy applies. Claims must be filed within 48 hours of the job finishing.

## 7. Liability

Nothing in these terms excludes liability that cannot lawfully be excluded. Subject to that, our liability in connection with a booking is limited to the amount you paid for it, except in respect of an approved damage claim.

## 8. Account suspension

We may suspend or close an account for fraud, abuse, repeated non-payment, or behaviour that puts a Partner at risk.

## 9. Changes

We may update these terms. Material changes require your acceptance before you make a new booking. We will tell you what changed.

## 10. Governing law

These terms are governed by the laws of Malaysia and subject to the exclusive jurisdiction of the Malaysian courts.

## 11. Contact

${CONTACT}
`,
    contentMdMy: `${header('Terma Perkhidmatan Pelanggan')}## 1. Siapa kami

ServisAku mengendalikan platform yang menghubungkan pelanggan dengan profesional perkhidmatan bebas ("Rakan Kongsi"). Kami bukan penyedia perkhidmatan tersebut; Rakan Kongsi yang melaksanakannya.

## 2. Membuat tempahan

Apabila anda mengesahkan tempahan, anda memasuki perjanjian dengan kami untuk mengatur perkhidmatan, dan dengan Rakan Kongsi untuk pelaksanaannya. Harga yang dipaparkan semasa pembayaran adalah harga yang anda bayar, termasuk Cukai Perkhidmatan (SST) jika berkenaan.

## 3. Pembayaran

Anda boleh membayar dalam talian (FPX, DuitNow, kad, atau e-dompet) atau secara tunai terus kepada Rakan Kongsi setelah selesai.

Pembayaran dalam talian disimpan dalam escrow dan dilepaskan kepada Rakan Kongsi selepas perkhidmatan selesai. Pembayaran tunai direkodkan dalam aplikasi oleh Rakan Kongsi dan resit dikeluarkan kepada anda.

## 4. Pembatalan dan bayaran balik

Bayaran balik mengikut Polisi Pembatalan dan Polisi Bayaran Balik kami, yang merupakan sebahagian daripada terma ini. Ringkasnya, jumlah bayaran balik bergantung pada notis yang anda berikan:

- lebih 48 jam sebelum tempahan — 100%
- 4 hingga 48 jam sebelum — 75%
- kurang 4 jam sebelum — 50%
- selepas Rakan Kongsi menerima tempahan — 50%

Jika Rakan Kongsi tidak hadir, anda menerima bayaran balik penuh.

## 5. Tanggungjawab anda

Anda bersetuju untuk menyediakan akses yang selamat dan sah ke premis, maklumat tepat tentang kerja, dan melayan Rakan Kongsi dengan hormat. Anda bertanggungjawab menyimpan barang berharga dan haiwan peliharaan sebelum Rakan Kongsi tiba.

## 6. Kerosakan

Jika Rakan Kongsi merosakkan harta anda, Polisi Kerosakan kami terpakai. Tuntutan mesti difailkan dalam masa 48 jam selepas kerja selesai.

## 7. Liabiliti

Tiada apa-apa dalam terma ini mengecualikan liabiliti yang tidak boleh dikecualikan di sisi undang-undang. Tertakluk kepada itu, liabiliti kami berkaitan tempahan adalah terhad kepada jumlah yang anda bayar untuknya, kecuali berkenaan tuntutan kerosakan yang diluluskan.

## 8. Penggantungan akaun

Kami boleh menggantung atau menutup akaun kerana penipuan, penyalahgunaan, kegagalan membayar berulang kali, atau tingkah laku yang membahayakan Rakan Kongsi.

## 9. Perubahan

Kami boleh mengemas kini terma ini. Perubahan material memerlukan penerimaan anda sebelum membuat tempahan baharu. Kami akan memberitahu apa yang berubah.

## 10. Undang-undang yang mentadbir

Terma ini ditadbir oleh undang-undang Malaysia dan tertakluk kepada bidang kuasa eksklusif mahkamah Malaysia.

## 11. Hubungi

${CONTACT}
`,
  },
  {
    slug: 'partner_terms', audience: 'partner',
    title: 'Partner Terms of Service', titleMy: 'Terma Perkhidmatan Rakan Kongsi',
    contentMd: `${header('Partner Terms of Service')}## 1. Your status

You are an independent contractor, not an employee of ${COMPANY}. You decide which jobs to accept and how to perform them, subject to these terms and the platform's quality standards.

## 2. Verification

You must complete identity verification and provide accurate documents. You may only accept jobs in service categories for which you have been approved.

## 3. Commission

We charge a commission on each completed booking. The rate applicable to you is shown in your app.

**Online bookings:** we collect payment from the customer, deduct commission, and credit the balance to your wallet.

**Cash bookings:** you collect the full fare from the customer, so the commission becomes an amount you owe us. It is added to your outstanding balance and settled on a schedule (weekly by default).

## 4. Settlement of commission

Settlements are due 7 days after the end of the period they cover. If a settlement is unpaid past its due date:

- we will send reminders;
- after 7 days, you will stop receiving new job offers;
- after 14 days, payouts are suspended;

until the outstanding amount is settled. Jobs you have already accepted are not affected. A small outstanding balance within your credit limit does not trigger these steps.

## 5. Payouts

Payouts run weekly to the bank account you have verified with us. A minimum balance applies. Funds typically reach your bank within 1–3 working days.

## 6. Your obligations

You will attend accepted jobs punctually, perform work to a professional standard, hold any licences your trade requires, and treat customers and their property with care.

## 7. Damage and liability

If you damage a customer's property, our Damage Policy applies. Where you are found liable, the amount is deducted from your wallet, or referred to your insurer where your liability exceeds the insurance threshold. You will always have the opportunity to give your account before any liability decision is made.

## 8. Refunds

Where a refund is issued because of something you did or failed to do, we may recover part or all of it from you. Liability is decided case by case, and you will be told the reason.

## 9. Suspension and removal

We may suspend or remove you for fraud, repeated poor ratings, safety incidents, unresolved damage claims, or failure to settle outstanding commission.

## 10. Changes

We may update these terms. Material changes require your acceptance before you accept further jobs.

## 11. Governing law

These terms are governed by the laws of Malaysia.

## 12. Contact

${CONTACT}
`,
    contentMdMy: `${header('Terma Perkhidmatan Rakan Kongsi')}## 1. Status anda

Anda adalah kontraktor bebas, bukan pekerja ${COMPANY}. Anda memutuskan kerja yang hendak diterima dan cara melaksanakannya, tertakluk kepada terma ini dan standard kualiti platform.

## 2. Pengesahan

Anda mesti melengkapkan pengesahan identiti dan memberikan dokumen yang tepat. Anda hanya boleh menerima kerja dalam kategori perkhidmatan yang telah diluluskan untuk anda.

## 3. Komisen

Kami mengenakan komisen bagi setiap tempahan yang selesai. Kadar yang terpakai kepada anda dipaparkan dalam aplikasi anda.

**Tempahan dalam talian:** kami mengutip bayaran daripada pelanggan, menolak komisen, dan mengkreditkan baki ke dompet anda.

**Tempahan tunai:** anda mengutip bayaran penuh daripada pelanggan, jadi komisen menjadi jumlah yang anda hutang kepada kami. Ia ditambah ke baki tertunggak anda dan diselesaikan mengikut jadual (mingguan secara lalai).

## 4. Penyelesaian komisen

Penyelesaian perlu dibayar 7 hari selepas tamat tempoh yang diliputi. Jika tidak dibayar melepasi tarikh akhir:

- kami akan menghantar peringatan;
- selepas 7 hari, anda akan berhenti menerima tawaran kerja baharu;
- selepas 14 hari, bayaran digantung;

sehingga jumlah tertunggak diselesaikan. Kerja yang telah anda terima tidak terjejas. Baki tertunggak kecil dalam had kredit anda tidak mencetuskan langkah ini.

## 5. Bayaran

Bayaran dibuat setiap minggu ke akaun bank yang telah anda sahkan. Baki minimum terpakai. Dana biasanya sampai dalam masa 1–3 hari bekerja.

## 6. Kewajipan anda

Anda akan hadir tepat pada masanya, melaksanakan kerja mengikut standard profesional, memiliki lesen yang diperlukan, dan menjaga pelanggan serta harta mereka dengan berhati-hati.

## 7. Kerosakan dan liabiliti

Jika anda merosakkan harta pelanggan, Polisi Kerosakan kami terpakai. Jika anda didapati bertanggungjawab, jumlah tersebut ditolak daripada dompet anda, atau dirujuk kepada penanggung insurans anda jika liabiliti melebihi ambang insurans. Anda sentiasa berpeluang memberikan penjelasan sebelum sebarang keputusan liabiliti dibuat.

## 8. Bayaran balik

Jika bayaran balik dikeluarkan kerana tindakan atau kecuaian anda, kami boleh menuntut sebahagian atau keseluruhannya daripada anda. Liabiliti diputuskan mengikut kes, dan anda akan diberitahu sebabnya.

## 9. Penggantungan dan penyingkiran

Kami boleh menggantung atau menyingkirkan anda kerana penipuan, penarafan buruk berulang, insiden keselamatan, tuntutan kerosakan yang belum selesai, atau kegagalan menyelesaikan komisen tertunggak.

## 10. Perubahan

Kami boleh mengemas kini terma ini. Perubahan material memerlukan penerimaan anda sebelum menerima kerja selanjutnya.

## 11. Undang-undang yang mentadbir

Terma ini ditadbir oleh undang-undang Malaysia.

## 12. Hubungi

${CONTACT}
`,
  },
  {
    slug: 'privacy_policy', audience: 'all',
    title: 'Privacy Policy', titleMy: 'Dasar Privasi',
    contentMd: `${header('Privacy Policy')}This policy explains how ${COMPANY} handles personal data, in line with the Personal Data Protection Act 2010 (PDPA).

## 1. What we collect

- **Account data** — name, email, phone number, and for Partners, identity and banking details.
- **Booking data** — service address, job details, photographs you upload, and messages exchanged in the app.
- **Payment data** — payment method, amounts and status. Full card numbers are handled by our payment providers and are never stored by us.
- **Location data** — a Partner's location while they are travelling to or performing a job.
- **Device data** — device identifiers and push tokens, for notifications.

## 2. Why we use it

To arrange and deliver bookings, to process payments and payouts, to investigate refunds, disputes and damage claims, to provide support, to prevent fraud, and to meet our legal and tax obligations.

## 3. Who we share it with

- The Partner assigned to your booking, and the customer a Partner is assigned to — limited to what is needed to perform the job.
- Payment providers, to take payment and make payouts.
- Our infrastructure and communications providers, under contract.
- Authorities, where the law requires it.

We do not sell personal data.

## 4. Retention

We keep account data while your account is open. Tax invoices are retained for 7 years as required by Malaysian law, and records of acceptance of these policies are retained for the applicable limitation period, even after an account is closed.

## 5. Your rights

Under the PDPA you may request access to your data, ask us to correct it, limit how we process it, or withdraw consent. Contact ${CONTACT}. Some data cannot be deleted where we are legally required to keep it.

## 6. Security

Access is restricted by role. Evidence files and bank details are stored privately and served only to those entitled to see them. Passwords and payment credentials are never stored in plain text.

## 7. Changes

We will tell you about material changes and, where required, ask you to accept them.

## 8. Contact

${CONTACT}
`,
    contentMdMy: `${header('Dasar Privasi')}Dasar ini menerangkan cara ${COMPANY} mengendalikan data peribadi, selaras dengan Akta Perlindungan Data Peribadi 2010 (PDPA).

## 1. Apa yang kami kumpulkan

- **Data akaun** — nama, e-mel, nombor telefon, dan bagi Rakan Kongsi, butiran identiti dan perbankan.
- **Data tempahan** — alamat perkhidmatan, butiran kerja, gambar yang anda muat naik, dan mesej dalam aplikasi.
- **Data pembayaran** — kaedah pembayaran, jumlah dan status. Nombor kad penuh dikendalikan oleh penyedia pembayaran kami dan tidak pernah disimpan oleh kami.
- **Data lokasi** — lokasi Rakan Kongsi semasa dalam perjalanan atau melaksanakan kerja.
- **Data peranti** — pengecam peranti dan token tolak, untuk pemberitahuan.

## 2. Mengapa kami menggunakannya

Untuk mengatur dan menyampaikan tempahan, memproses pembayaran, menyiasat bayaran balik, pertikaian dan tuntutan kerosakan, memberikan sokongan, mencegah penipuan, dan memenuhi kewajipan undang-undang dan cukai.

## 3. Dengan siapa kami berkongsi

- Rakan Kongsi yang ditugaskan kepada tempahan anda, dan pelanggan yang ditugaskan kepada Rakan Kongsi — terhad kepada apa yang diperlukan.
- Penyedia pembayaran, untuk mengutip bayaran dan membuat pembayaran.
- Penyedia infrastruktur dan komunikasi kami, di bawah kontrak.
- Pihak berkuasa, jika dikehendaki undang-undang.

Kami tidak menjual data peribadi.

## 4. Pengekalan

Kami menyimpan data akaun selagi akaun anda dibuka. Invois cukai disimpan selama 7 tahun seperti dikehendaki undang-undang Malaysia, dan rekod penerimaan dasar ini disimpan sepanjang tempoh had masa yang terpakai, walaupun selepas akaun ditutup.

## 5. Hak anda

Di bawah PDPA anda boleh meminta akses kepada data anda, meminta pembetulan, mengehadkan pemprosesan, atau menarik balik persetujuan. Hubungi ${CONTACT}. Sesetengah data tidak boleh dipadam jika kami dikehendaki menyimpannya di sisi undang-undang.

## 6. Keselamatan

Akses dihadkan mengikut peranan. Fail bukti dan butiran bank disimpan secara persendirian. Kata laluan dan kelayakan pembayaran tidak pernah disimpan dalam teks biasa.

## 7. Perubahan

Kami akan memberitahu anda tentang perubahan material dan, jika perlu, meminta anda menerimanya.

## 8. Hubungi

${CONTACT}
`,
  },
  {
    slug: 'refund_policy', audience: 'all',
    title: 'Refund Policy', titleMy: 'Polisi Bayaran Balik',
    contentMd: `${header('Refund Policy')}## 1. When a refund applies

A refund may be due if you cancel a booking, if a Partner does not attend, or if a service is not delivered to an acceptable standard.

## 2. Amount

Cancellation refunds follow the tiers in our Cancellation Policy. A Partner no-show is refunded in full regardless of notice.

Where a service was performed but you are dissatisfied, no automatic refund applies — raise a dispute and we will investigate. Outcomes may include a full refund, a partial refund, a redo at no cost, or no refund, depending on what we find.

## 3. How it is paid

Refunds go back to your original payment method. For a cash booking, the Partner returns the money to you directly and we adjust their account accordingly.

## 4. Timing

Eligible cancellation refunds are processed automatically. Other refunds are reviewed within 3 working days. Once processed, funds typically take 3–10 working days to appear, depending on your bank or card issuer.

## 5. Partial refunds

You may be refunded part of a booking. The total refunded across all requests can never exceed what you paid.

## 6. Tax

Where a tax invoice was issued, a credit note is issued with your refund, reversing the SST proportionally.

## 7. Disputes

If you disagree with a refund decision, you may raise a dispute. Contact ${CONTACT}.
`,
    contentMdMy: `${header('Polisi Bayaran Balik')}## 1. Bila bayaran balik terpakai

Bayaran balik mungkin dikenakan jika anda membatalkan tempahan, jika Rakan Kongsi tidak hadir, atau jika perkhidmatan tidak disampaikan mengikut standard yang boleh diterima.

## 2. Jumlah

Bayaran balik pembatalan mengikut peringkat dalam Polisi Pembatalan kami. Ketidakhadiran Rakan Kongsi dibayar balik sepenuhnya tanpa mengira notis.

Jika perkhidmatan telah dilaksanakan tetapi anda tidak berpuas hati, tiada bayaran balik automatik — failkan pertikaian dan kami akan menyiasat. Hasilnya mungkin bayaran balik penuh, separa, kerja semula tanpa kos, atau tiada bayaran balik.

## 3. Cara pembayaran

Bayaran balik dikembalikan ke kaedah pembayaran asal anda. Bagi tempahan tunai, Rakan Kongsi memulangkan wang terus kepada anda dan kami melaraskan akaun mereka.

## 4. Masa

Bayaran balik pembatalan yang layak diproses secara automatik. Bayaran balik lain disemak dalam masa 3 hari bekerja. Setelah diproses, dana biasanya mengambil masa 3–10 hari bekerja untuk muncul.

## 5. Bayaran balik separa

Anda mungkin menerima bayaran balik sebahagian daripada tempahan. Jumlah keseluruhan tidak boleh melebihi apa yang anda bayar.

## 6. Cukai

Jika invois cukai telah dikeluarkan, nota kredit dikeluarkan bersama bayaran balik anda, membalikkan SST secara berkadar.

## 7. Pertikaian

Jika anda tidak bersetuju dengan keputusan bayaran balik, anda boleh memfailkan pertikaian. Hubungi ${CONTACT}.
`,
  },
  {
    slug: 'cancellation_policy', audience: 'all',
    title: 'Cancellation Policy', titleMy: 'Polisi Pembatalan',
    contentMd: `${header('Cancellation Policy')}## 1. Cancelling as a customer

You can cancel from your booking screen at any time before the service starts. The refund depends on how much notice you give:

| Notice given | Refund |
| --- | --- |
| More than 48 hours | 100% |
| 4 to 48 hours | 75% |
| Less than 4 hours | 50% |
| After a Partner has accepted | 50% |

You will see the exact amount before you confirm.

## 2. Once work has started

A booking that has started or been completed cannot be cancelled for an automatic refund. If something went wrong, raise a dispute.

## 3. If a Partner cancels

We will try to reassign your booking. If we cannot, you are refunded in full and pay nothing.

## 4. If a Partner does not attend

You are refunded in full regardless of notice.

## 5. Cancelling as a Partner

Accepting a job is a commitment. Repeated cancellations after acceptance affect your rating and may lead to suspension. Cancel as early as possible so the job can be reassigned.

## 6. Circumstances beyond control

Where a booking cannot go ahead because of severe weather, an emergency, or another event outside either party's control, it is cancelled with a full refund and no penalty to either side.
`,
    contentMdMy: `${header('Polisi Pembatalan')}## 1. Membatalkan sebagai pelanggan

Anda boleh membatalkan dari skrin tempahan anda pada bila-bila masa sebelum perkhidmatan bermula. Bayaran balik bergantung pada notis yang diberikan:

| Notis diberikan | Bayaran balik |
| --- | --- |
| Lebih 48 jam | 100% |
| 4 hingga 48 jam | 75% |
| Kurang 4 jam | 50% |
| Selepas Rakan Kongsi menerima | 50% |

Anda akan melihat jumlah tepat sebelum mengesahkan.

## 2. Setelah kerja bermula

Tempahan yang telah bermula atau selesai tidak boleh dibatalkan untuk bayaran balik automatik. Jika ada masalah, failkan pertikaian.

## 3. Jika Rakan Kongsi membatalkan

Kami akan cuba menugaskan semula tempahan anda. Jika tidak berjaya, anda menerima bayaran balik penuh dan tidak membayar apa-apa.

## 4. Jika Rakan Kongsi tidak hadir

Anda menerima bayaran balik penuh tanpa mengira notis.

## 5. Membatalkan sebagai Rakan Kongsi

Menerima kerja adalah komitmen. Pembatalan berulang selepas penerimaan menjejaskan penarafan anda dan boleh membawa kepada penggantungan. Batalkan seawal mungkin.

## 6. Keadaan di luar kawalan

Jika tempahan tidak dapat diteruskan kerana cuaca buruk, kecemasan, atau peristiwa lain di luar kawalan, ia dibatalkan dengan bayaran balik penuh tanpa penalti kepada mana-mana pihak.
`,
  },
  {
    slug: 'damage_policy', audience: 'all',
    title: 'Damage Policy', titleMy: 'Polisi Kerosakan',
    contentMd: `${header('Damage Policy')}## 1. Reporting damage

If a Partner damages your property, file a claim from your booking within **48 hours** of the job finishing. Claims filed later are still accepted but are considered case by case.

You will need at least one photograph of the damage, a description of what happened, and the cost of repair or replacement.

## 2. What happens next

| Stage | Timeframe |
| --- | --- |
| We acknowledge your claim | within 24 hours |
| The Partner responds | within 72 hours |
| Investigation completed | within 7 days |
| Compensation arranged | within 14 days of approval |

If the Partner does not respond within 72 hours, we proceed without their account and note the non-response.

## 3. Evidence

Both you and the Partner may submit evidence while the claim is open. Once a decision is made, evidence is closed so that the record behind the decision cannot change afterwards.

## 4. Decision and liability

We decide the approved amount and how responsibility is shared. A claim may be approved in full, approved in part, or declined. Responsibility may rest with the Partner, with us, or be shared — for example where damage was partly pre-existing.

## 5. Compensation

Compensation may be paid as a refund to your original payment method, a bank transfer, a replacement, or through the Partner's insurance where their liability is substantial.

## 6. Appeals

You may appeal a decision once. The claim is reopened and reviewed again. The second decision is final.

## 7. What is not covered

- Damage that existed before the job, or normal wear and tear.
- Loss of items not reported at the time.
- Consequential loss, such as lost income.
- Damage caused by you providing inaccurate information about the job or the premises.

## 8. Contact

${CONTACT}
`,
    contentMdMy: `${header('Polisi Kerosakan')}## 1. Melaporkan kerosakan

Jika Rakan Kongsi merosakkan harta anda, failkan tuntutan dari tempahan anda dalam masa **48 jam** selepas kerja selesai. Tuntutan yang difailkan kemudian tetap diterima tetapi dipertimbangkan mengikut kes.

Anda memerlukan sekurang-kurangnya satu gambar kerosakan, penerangan tentang apa yang berlaku, dan kos pembaikan atau penggantian.

## 2. Apa yang berlaku seterusnya

| Peringkat | Tempoh |
| --- | --- |
| Kami mengakui tuntutan anda | dalam 24 jam |
| Rakan Kongsi membalas | dalam 72 jam |
| Siasatan selesai | dalam 7 hari |
| Pampasan diaturkan | dalam 14 hari selepas kelulusan |

Jika Rakan Kongsi tidak membalas dalam 72 jam, kami meneruskan tanpa penjelasan mereka dan mencatatkannya.

## 3. Bukti

Anda dan Rakan Kongsi boleh mengemukakan bukti semasa tuntutan dibuka. Setelah keputusan dibuat, bukti ditutup supaya rekod di sebalik keputusan itu tidak boleh berubah.

## 4. Keputusan dan liabiliti

Kami menentukan jumlah yang diluluskan dan cara tanggungjawab dikongsi. Tuntutan boleh diluluskan sepenuhnya, sebahagian, atau ditolak. Tanggungjawab mungkin terletak pada Rakan Kongsi, pada kami, atau dikongsi.

## 5. Pampasan

Pampasan boleh dibayar sebagai bayaran balik ke kaedah pembayaran asal, pemindahan bank, penggantian, atau melalui insurans Rakan Kongsi jika liabiliti mereka besar.

## 6. Rayuan

Anda boleh merayu keputusan sekali sahaja. Tuntutan dibuka semula dan disemak semula. Keputusan kedua adalah muktamad.

## 7. Apa yang tidak dilindungi

- Kerosakan yang wujud sebelum kerja, atau haus dan lusuh biasa.
- Kehilangan barang yang tidak dilaporkan pada masa itu.
- Kerugian berbangkit, seperti kehilangan pendapatan.
- Kerosakan akibat maklumat tidak tepat yang anda berikan.

## 8. Hubungi

${CONTACT}
`,
  },
];

async function main() {
  let created = 0;
  let published = 0;

  for (const doc of DOCS) {
    const existing = await prisma.legalDocument.findUnique({
      where: { slug_version: { slug: doc.slug, version: '1.0' } },
    });
    let row = existing;
    if (!row) {
      row = await prisma.legalDocument.create({
        data: {
          slug: doc.slug,
          version: '1.0',
          title: doc.title,
          titleMy: doc.titleMy,
          contentMd: doc.contentMd,
          contentMdMy: doc.contentMdMy,
          audience: doc.audience,
          requiresAcceptance: true,
          isActive: false,
          effectiveFrom: EFFECTIVE,
        },
      });
      created += 1;
      console.log(`  drafted ${doc.slug} v1.0 (${doc.audience})`);
    }
    if (PUBLISH && !row.publishedAt) {
      await publish(row.id, null);
      published += 1;
      console.log(`  published ${doc.slug} v1.0`);
    }
  }

  console.log(`\nLegal: ${created} drafted, ${published} published, ${DOCS.length - created} already present.`);
  if (!PUBLISH) console.log('Re-run with --publish to make them live.');
  if (COMPANY_NO.startsWith('[')) {
    console.log(
      '\n⚠  Placeholders are unfilled. Set LEGAL_COMPANY_NO, LEGAL_ADDRESS and\n'
      + '   LEGAL_CONTACT_EMAIL in .env, then create a v1.1 with the real values.\n'
      + '   This text is drafting scaffolding written to match how the platform\n'
      + '   actually behaves — it MUST be reviewed by Malaysian counsel before launch.',
    );
  }
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
