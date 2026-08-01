// Seeds the SST configuration.
//
// Malaysian service tax rose from 6% to 8% for most taxable services on
// 2024-03-01. Both rows are seeded so the rate history is complete: a booking
// made before that date resolves to 6%, one after to 8%, which is what keeps
// historical invoices correct.
//
//   node prisma/taxSeed.js
//
// Idempotent — re-running leaves the existing rows alone.
import 'dotenv/config';
import { prisma } from '../server/db.js';

const ROWS = [
  {
    code: 'SST_SERVICE',
    rate: 0.06,
    effectiveFrom: new Date('2018-09-01T00:00:00+08:00'),
    effectiveTo: new Date('2024-02-29T23:59:59+08:00'),
    isActive: false,
    notes: 'Service tax at 6% (SST reintroduced 2018-09-01).',
  },
  {
    code: 'SST_SERVICE',
    rate: 0.08,
    effectiveFrom: new Date('2024-03-01T00:00:00+08:00'),
    effectiveTo: null,
    isActive: true,
    notes: 'Service tax raised to 8% on 2024-03-01 for most taxable services.',
  },
  {
    code: 'SST_COMMISSION',
    rate: 0.08,
    effectiveFrom: new Date('2024-03-01T00:00:00+08:00'),
    effectiveTo: null,
    isActive: true,
    notes: "Service tax on ServisAku's commission to partners — itself a taxable supply.",
  },
];

async function main() {
  let created = 0;
  for (const row of ROWS) {
    const existing = await prisma.taxConfig.findUnique({
      where: { code_effectiveFrom: { code: row.code, effectiveFrom: row.effectiveFrom } },
    });
    if (existing) continue;
    await prisma.taxConfig.create({
      data: { ...row, registrationNo: process.env.SST_REGISTRATION_NO || null },
    });
    created += 1;
    console.log(`  ${row.code} @ ${(row.rate * 100).toFixed(0)}% from ${row.effectiveFrom.toISOString().slice(0, 10)}`);
  }
  console.log(`\nTax config: ${created} row(s) created, ${ROWS.length - created} already present.`);
  if (!process.env.SST_REGISTRATION_NO) {
    console.log(
      '\n⚠  SST_REGISTRATION_NO is not set. A Malaysian tax invoice must carry the\n'
      + '   supplier\'s SST registration number — set it in .env before issuing real\n'
      + '   invoices, then re-run this seed to stamp it onto the active rows.',
    );
  }
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
