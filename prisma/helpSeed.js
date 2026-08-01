// Seeds the help centre.
//
// The consumer FAQs are lifted from the five hardcoded entries that used to live
// in src/pages/Help.jsx, corrected where they had drifted from how the platform
// actually works (escrow, the tiered cancellation policy, cash payments).
//
//   node prisma/helpSeed.js
//
// Idempotent — existing slugs are left alone.
import 'dotenv/config';
import { prisma } from '../server/db.js';

const CATEGORIES = [
  { slug: 'booking', name: 'Booking a service', nameMy: 'Menempah perkhidmatan', iconKey: 'CalendarDays', audience: 'consumer', sortOrder: 1 },
  { slug: 'payments', name: 'Payments & refunds', nameMy: 'Pembayaran & bayaran balik', iconKey: 'CreditCard', audience: 'consumer', sortOrder: 2 },
  { slug: 'during-service', name: 'During your service', nameMy: 'Semasa perkhidmatan', iconKey: 'Wrench', audience: 'consumer', sortOrder: 3 },
  { slug: 'account', name: 'Your account', nameMy: 'Akaun anda', iconKey: 'User', audience: 'all', sortOrder: 4 },
  { slug: 'partner-earnings', name: 'Earnings & payouts', nameMy: 'Pendapatan & bayaran', iconKey: 'Banknote', audience: 'partner', sortOrder: 5 },
  { slug: 'partner-jobs', name: 'Jobs & scheduling', nameMy: 'Kerja & jadual', iconKey: 'ClipboardList', audience: 'partner', sortOrder: 6 },
];

const ARTICLES = [
  {
    categorySlug: 'booking', slug: 'how-do-i-book-a-service', audience: 'consumer', sortOrder: 1,
    title: 'How do I book a service?',
    titleMy: 'Bagaimana saya menempah perkhidmatan?',
    bodyMd: `Browse the categories on the Explore page and pick the service you need.

Answer a few questions about the job so we can price it accurately, choose a date and time, then confirm. You'll see the full price — including SST — before you pay anything.

A verified professional is then matched to your booking, and you can track their arrival in the app.`,
    bodyMdMy: `Layari kategori di halaman Explore dan pilih perkhidmatan yang anda perlukan.

Jawab beberapa soalan tentang kerja tersebut supaya kami boleh memberi harga yang tepat, pilih tarikh dan masa, kemudian sahkan. Anda akan melihat harga penuh — termasuk SST — sebelum membayar.

Seorang profesional yang disahkan akan dipadankan dengan tempahan anda, dan anda boleh menjejaki ketibaan mereka dalam aplikasi.`,
  },
  {
    categorySlug: 'payments', slug: 'how-do-i-pay', audience: 'consumer', sortOrder: 1,
    title: 'What payment methods can I use?',
    titleMy: 'Kaedah pembayaran apa yang boleh saya guna?',
    bodyMd: `You can pay online by FPX, DuitNow, credit or debit card, or an e-wallet — or choose **Cash on Service** and pay your professional directly when the job is done.

If you pay online, your money is held securely in escrow and only released to the professional after the service is complete.

If you pay cash, your professional records the payment in the app and you receive a receipt straight away.`,
    bodyMdMy: `Anda boleh membayar dalam talian melalui FPX, DuitNow, kad kredit atau debit, atau e-dompet — atau pilih **Tunai Semasa Perkhidmatan** dan bayar terus kepada profesional anda apabila kerja selesai.

Jika anda membayar dalam talian, wang anda disimpan dengan selamat dalam escrow dan hanya dilepaskan kepada profesional selepas perkhidmatan selesai.

Jika anda membayar tunai, profesional anda akan merekodkan pembayaran dalam aplikasi dan anda akan menerima resit serta-merta.`,
  },
  {
    categorySlug: 'payments', slug: 'cancellation-and-refunds', audience: 'consumer', sortOrder: 2,
    title: 'Can I cancel, and will I be refunded?',
    titleMy: 'Bolehkah saya membatalkan, dan adakah saya akan menerima bayaran balik?',
    bodyMd: `Yes. How much you get back depends on how much notice you give:

- **More than 48 hours** before the booking — full refund
- **4 to 48 hours** before — 75% refund
- **Less than 4 hours** before — 50% refund
- **A professional has already accepted** — 50% refund

If your professional doesn't turn up, you're refunded in full regardless of notice.

Cancel from your booking screen. You'll see the exact refund amount before you confirm, and eligible refunds are processed automatically.`,
    bodyMdMy: `Ya. Jumlah bayaran balik bergantung pada notis yang anda berikan:

- **Lebih 48 jam** sebelum tempahan — bayaran balik penuh
- **4 hingga 48 jam** sebelum — bayaran balik 75%
- **Kurang 4 jam** sebelum — bayaran balik 50%
- **Profesional telah menerima tempahan** — bayaran balik 50%

Jika profesional anda tidak hadir, anda akan menerima bayaran balik penuh tanpa mengira notis.

Batalkan dari skrin tempahan anda. Anda akan melihat jumlah bayaran balik sebelum mengesahkan.`,
  },
  {
    categorySlug: 'payments', slug: 'sst-on-my-invoice', audience: 'consumer', sortOrder: 3,
    title: 'Why is there SST on my invoice?',
    titleMy: 'Mengapa terdapat SST pada invois saya?',
    bodyMd: `Service Tax (SST) is charged on taxable services in Malaysia at the rate in force when you booked.

Your tax invoice itemises the service amount and the SST separately, and carries our SST registration number. You can view and download it from your booking at any time.

If you're refunded, we issue a credit note that reverses the tax proportionally.`,
    bodyMdMy: `Cukai Perkhidmatan (SST) dikenakan ke atas perkhidmatan bercukai di Malaysia pada kadar yang berkuat kuasa semasa anda membuat tempahan.

Invois cukai anda memaparkan jumlah perkhidmatan dan SST secara berasingan, serta nombor pendaftaran SST kami. Anda boleh melihat dan memuat turunnya dari tempahan anda pada bila-bila masa.

Jika anda menerima bayaran balik, kami akan mengeluarkan nota kredit yang membalikkan cukai secara berkadar.`,
  },
  {
    categorySlug: 'during-service', slug: 'are-professionals-verified', audience: 'consumer', sortOrder: 1,
    title: 'Are the professionals verified?',
    titleMy: 'Adakah profesional disahkan?',
    bodyMd: `Yes. Every partner completes identity verification (MyKad), submits proof of their skills, and is approved by our team before they can accept any booking.

Partners are also verified per service — someone approved for aircon servicing cannot accept a plumbing job.`,
    bodyMdMy: `Ya. Setiap rakan kongsi melengkapkan pengesahan identiti (MyKad), menghantar bukti kemahiran, dan diluluskan oleh pasukan kami sebelum boleh menerima sebarang tempahan.

Rakan kongsi juga disahkan mengikut perkhidmatan — seseorang yang diluluskan untuk servis penghawa dingin tidak boleh menerima kerja paip.`,
  },
  {
    categorySlug: 'during-service', slug: 'something-was-damaged', audience: 'consumer', sortOrder: 2,
    title: 'Something was damaged during the service',
    titleMy: 'Sesuatu rosak semasa perkhidmatan',
    bodyMd: `File a damage claim from your booking within 48 hours of the job finishing.

You'll need at least one photo of the damage, a description of what happened, and the repair or replacement cost. We acknowledge every claim within 24 hours, give the professional 72 hours to respond, and aim to complete the investigation within 7 days.

If the claim is approved, compensation is arranged within 14 days.`,
    bodyMdMy: `Failkan tuntutan kerosakan dari tempahan anda dalam masa 48 jam selepas kerja selesai.

Anda memerlukan sekurang-kurangnya satu gambar kerosakan, penerangan tentang apa yang berlaku, dan kos pembaikan atau penggantian. Kami mengakui setiap tuntutan dalam masa 24 jam, memberi profesional 72 jam untuk membalas, dan menyasarkan siasatan selesai dalam masa 7 hari.

Jika tuntutan diluluskan, pampasan akan diaturkan dalam masa 14 hari.`,
  },
  {
    categorySlug: 'partner-earnings', slug: 'when-do-i-get-paid', audience: 'partner', sortOrder: 1,
    title: 'When do I get paid?',
    titleMy: 'Bilakah saya akan dibayar?',
    bodyMd: `Earnings from online bookings move into your wallet once the job is complete and escrow is released.

Payouts run weekly. Funds usually reach your bank within 1–3 working days after a run. You need verified bank details on file and a balance above the minimum payout to be included.

You can see your available balance, pending earnings and payout history in your Wallet.`,
    bodyMdMy: `Pendapatan dari tempahan dalam talian akan masuk ke dompet anda apabila kerja selesai dan escrow dilepaskan.

Bayaran dibuat setiap minggu. Dana biasanya sampai ke bank anda dalam masa 1–3 hari bekerja. Anda memerlukan butiran bank yang disahkan dan baki melebihi bayaran minimum untuk disertakan.

Anda boleh melihat baki tersedia, pendapatan belum selesai dan sejarah bayaran dalam Dompet anda.`,
  },
  {
    categorySlug: 'partner-earnings', slug: 'cash-jobs-and-commission', audience: 'partner', sortOrder: 2,
    title: 'How does commission work on cash jobs?',
    titleMy: 'Bagaimana komisen berfungsi untuk kerja tunai?',
    bodyMd: `On a cash job you collect the full fare from the customer at the door, so the ServisAku commission becomes an amount you owe back.

Record the cash in the app as soon as the job is done. The commission is added to your outstanding balance and settled on a schedule — weekly by default.

Settle from your Wallet, either online or from your available balance. If a settlement goes unpaid past its due date you'll get reminders, and after 7 days new jobs are paused until it's cleared.`,
    bodyMdMy: `Untuk kerja tunai, anda mengutip bayaran penuh daripada pelanggan, jadi komisen ServisAku menjadi jumlah yang anda perlu bayar balik.

Rekodkan tunai dalam aplikasi sebaik sahaja kerja selesai. Komisen akan ditambah ke baki tertunggak anda dan diselesaikan mengikut jadual — mingguan secara lalai.

Selesaikan dari Dompet anda, sama ada dalam talian atau dari baki tersedia. Jika penyelesaian tidak dibayar melepasi tarikh akhir, anda akan menerima peringatan, dan selepas 7 hari kerja baharu akan dihentikan sementara sehingga ia dijelaskan.`,
  },
];

async function main() {
  let cats = 0;
  let arts = 0;
  const idBySlug = {};

  for (const c of CATEGORIES) {
    const existing = await prisma.helpCategory.findUnique({ where: { slug: c.slug } });
    if (existing) { idBySlug[c.slug] = existing.id; continue; }
    const created = await prisma.helpCategory.create({ data: c });
    idBySlug[c.slug] = created.id;
    cats += 1;
  }

  for (const a of ARTICLES) {
    const existing = await prisma.helpArticle.findUnique({ where: { slug: a.slug } });
    if (existing) continue;
    const { categorySlug, ...rest } = a;
    await prisma.helpArticle.create({ data: { ...rest, categoryId: idBySlug[categorySlug] } });
    arts += 1;
  }

  console.log(`Help centre: ${cats} categor(ies) and ${arts} article(s) created.`);
  console.log(`Totals now: ${await prisma.helpCategory.count()} categories, ${await prisma.helpArticle.count()} articles.`);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
