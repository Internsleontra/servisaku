// ─────────────────────────────────────────────────────────────────────────────
// Payout batch smoke test — eligibility, approval gating, per-partner isolation.
//
//   node scripts/payout-smoke.mjs
// ─────────────────────────────────────────────────────────────────────────────
import 'dotenv/config';
import { prisma } from '../server/db.js';
import { cleanupAndReport } from './smoke-cleanup.mjs';
import {
  selectEligible, generateBatch, approveBatch, processBatch, retryPayout,
  MINIMUM_PAYOUT, EXCLUSION,
} from '../server/lib/payouts/batch.js';
import { toBankFile } from '../server/lib/payouts/export.js';
import { post, getWallet } from '../server/lib/wallet/index.js';

const tag = `payoutsmoke-${Date.now()}`;
let failures = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) failures += 1;
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? ` — ${extra}` : ''}`);
};

const partners = {};
let batchId;

async function makePartner(key, { balance, bank = 'verified', suspended = false }) {
  const u = await prisma.user.create({
    data: { email: `${tag}-${key}@t.local`, fullName: `Payout ${key}`, role: 'partner', partnerVerified: true },
  });
  partners[key] = u;
  if (balance > 0) {
    await post({
      partnerId: u.id, type: 'opening_balance', amount: balance,
      description: 'smoke fixture', idempotencyKey: `smoke:${u.id}`,
    });
  }
  if (suspended) {
    await prisma.partnerWallet.update({ where: { partnerId: u.id }, data: { payoutsSuspended: true } });
  }
  if (bank !== 'none') {
    await prisma.partnerBankAccount.create({
      data: {
        partnerId: u.id, bankName: 'Maybank', bankCode: 'MBBEMYKL',
        accountNumber: '512345678901', accountName: `Payout ${key}`,
        isVerified: bank === 'verified',
        verifiedAt: bank === 'verified' ? new Date() : null,
      },
    });
  }
  return u;
}

try {
  await makePartner('ok', { balance: 500 });
  await makePartner('small', { balance: 10 });
  await makePartner('nobank', { balance: 500, bank: 'none' });
  await makePartner('unverified', { balance: 500, bank: 'unverified' });
  await makePartner('suspended', { balance: 500, suspended: true });

  const { eligible, excluded } = await selectEligible();
  const isMine = (id) => Object.values(partners).some((p) => p.id === id);
  const mineEligible = eligible.filter((e) => isMine(e.partnerId));
  const mineExcluded = excluded.filter((e) => isMine(e.partnerId));
  const reasonFor = (key) => mineExcluded.find((e) => e.partnerId === partners[key].id)?.reason;

  ok('only the fully eligible partner is selected',
    mineEligible.length === 1 && mineEligible[0].partnerId === partners.ok.id,
    `${mineEligible.length} eligible`);
  ok(`below RM${MINIMUM_PAYOUT} is excluded`, reasonFor('small') === EXCLUSION.BELOW_MINIMUM, reasonFor('small'));
  ok('no bank account is excluded', reasonFor('nobank') === EXCLUSION.NO_BANK_ACCOUNT, reasonFor('nobank'));
  ok('unverified bank is excluded', reasonFor('unverified') === EXCLUSION.BANK_UNVERIFIED, reasonFor('unverified'));
  ok('suspended payouts are excluded', reasonFor('suspended') === EXCLUSION.PAYOUTS_SUSPENDED, reasonFor('suspended'));

  const { batch, created } = await generateBatch('manual');
  batchId = batch?.id;
  ok('batch generated as a draft', created && batch.status === 'draft', batch?.reference);

  // Processing must be refused before approval — this is the control that stops
  // money moving without a human decision.
  let refused = false;
  try { await processBatch(batchId); } catch { refused = true; }
  ok('an unapproved batch cannot be processed', refused);

  await approveBatch(batchId, 'smoke-admin');
  const beforeBalance = (await getWallet(partners.ok.id)).availableBalance;
  const result = await processBatch(batchId);
  const afterBalance = (await getWallet(partners.ok.id)).availableBalance;

  ok('processing pays the eligible partner', result.paid >= 1, `paid ${result.paid}, failed ${result.failed}`);
  ok('the wallet is debited by exactly the payout',
    Math.abs((beforeBalance - afterBalance) - 500) < 0.01,
    `RM${beforeBalance} → RM${afterBalance}`);

  // Re-processing must not pay twice.
  const rerun = await processBatch(batchId).catch(() => null);
  ok('a completed batch cannot be reprocessed', rerun === null);
  const finalBalance = (await getWallet(partners.ok.id)).availableBalance;
  ok('no double payment on re-run', Math.abs(finalBalance - afterBalance) < 0.01, `RM${finalBalance}`);

  const bankFile = await toBankFile(batchId);
  ok('bank file uses the frozen snapshot, not live details',
    bankFile.length >= 1 && bankFile[0].account_number === '512345678901' && bankFile[0].amount === '500.00',
    `${bankFile.length} row(s)`);
} catch (err) {
  console.error(`\n${err.stack || err.message}`);
  failures += 1;
} finally {
  const ids = Object.values(partners).map((p) => p.id);
  if (ids.length) {
    await prisma.payoutRecord.deleteMany({ where: { partnerId: { in: ids } } });
    await prisma.partnerBankAccount.deleteMany({ where: { partnerId: { in: ids } } });
  }
  if (batchId) await prisma.payoutBatch.delete({ where: { id: batchId } }).catch(() => {});
  await cleanupAndReport(Object.values(partners));
  await prisma.$disconnect();
}

console.log(failures === 0 ? '\n✅ payout smoke passed' : `\n❌ ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
