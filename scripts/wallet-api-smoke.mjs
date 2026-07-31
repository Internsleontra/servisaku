// ─────────────────────────────────────────────────────────────────────────────
// HTTP-level authorization checks for the payments/wallet endpoints.
//
// scripts/wallet-smoke.mjs proves the money maths; this proves the boundaries —
// who may record cash, whose wallet you can read, who may adjust a balance.
// These are the checks that matter most, because every one of them guards a
// path that moves money.
//
// Requires the API running (npm run dev:server):
//   node scripts/wallet-api-smoke.mjs
//
// Cleans up its fixtures. Exits non-zero on any failure.
// ─────────────────────────────────────────────────────────────────────────────
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { prisma } from '../server/db.js';
import { cleanupAndReport } from './smoke-cleanup.mjs';

const API = process.env.SMOKE_API_BASE || 'http://localhost:3001/api';
const tag = `authz-${Date.now()}`;
let failures = 0;

const ok = (label, cond, extra = '') => {
  if (!cond) failures += 1;
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? ` — ${extra}` : ''}`);
};

const tokenFor = (u) => jwt.sign({ id: u.id, email: u.email, role: u.role }, process.env.JWT_SECRET, { expiresIn: '10m' });

async function call(method, path, token, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

let consumer; let partnerA; let partnerB; let admin; let booking;

try {
  await fetch(`${API}/health`).catch(() => {
    throw new Error(`API not reachable at ${API} — start it with: npm run dev:server`);
  });

  consumer = await prisma.user.create({ data: { email: `${tag}-c@t.local`, fullName: 'Smoke Consumer', role: 'consumer' } });
  partnerA = await prisma.user.create({ data: { email: `${tag}-pa@t.local`, fullName: 'Assigned Partner', role: 'partner', partnerVerified: true } });
  partnerB = await prisma.user.create({ data: { email: `${tag}-pb@t.local`, fullName: 'Other Partner', role: 'partner', partnerVerified: true } });
  admin = await prisma.user.create({ data: { email: `${tag}-a@t.local`, fullName: 'Smoke Admin', role: 'admin' } });

  booking = await prisma.booking.create({
    data: {
      serviceType: 'Smoke Service', status: 'completed', price: 200, date: new Date(),
      consumerId: consumer.id, partnerId: partnerA.id, paymentMethod: 'cash', paymentStatus: 'pending',
    },
  });

  const tc = tokenFor(consumer);
  const ta = tokenFor(partnerA);
  const tb = tokenFor(partnerB);
  const tad = tokenFor(admin);

  console.log('\nCash collection authorization');
  let r = await call('POST', '/payments/cash/collect', null, { booking_id: booking.id, amount_collected: 200 });
  ok('unauthenticated is rejected', r.status === 401, String(r.status));

  r = await call('POST', '/payments/cash/collect', tc, { booking_id: booking.id, amount_collected: 200 });
  ok('consumer cannot record cash', r.status === 403, `${r.status} ${r.body?.error || ''}`);

  r = await call('POST', '/payments/cash/collect', tb, { booking_id: booking.id, amount_collected: 200 });
  ok('unassigned partner cannot record cash', r.status === 403, `${r.status} ${r.body?.error || ''}`);

  r = await call('POST', '/payments/cash/collect', ta, { booking_id: booking.id, amount_collected: 150 });
  ok('under-reported amount is rejected', r.status === 400, `${r.status} ${r.body?.error || ''}`);

  r = await call('POST', '/payments/cash/collect', ta, { booking_id: booking.id, amount_collected: 200 });
  ok('assigned partner records cash', r.status === 201, String(r.status));

  r = await call('POST', '/payments/cash/collect', ta, { booking_id: booking.id, amount_collected: 200 });
  ok('repeat collect is idempotent, not a second charge', r.status === 200, String(r.status));

  const wallet = await prisma.partnerWallet.findUnique({ where: { partnerId: partnerA.id } });
  ok('commission is charged exactly once at 20%', wallet?.outstandingCommission === 40, `RM${wallet?.outstandingCommission}`);

  console.log('\nWallet access scoping');
  r = await call('GET', '/wallet', ta);
  ok('partner reads their own wallet', r.status === 200 && r.body.outstanding_commission === 40, String(r.status));

  r = await call('GET', `/wallet?partner_id=${partnerA.id}`, tb);
  ok('partner_id is ignored for non-admins', r.status === 200 && r.body?.partner_id === partnerB.id,
    r.body?.partner_id === partnerA.id ? 'LEAKED another partner\'s wallet' : 'scoped to self');

  r = await call('GET', `/wallet?partner_id=${partnerA.id}`, tad);
  ok('admin may inspect a specific wallet', r.status === 200 && r.body?.partner_id === partnerA.id, String(r.status));

  console.log('\nAdmin-only mutations');
  r = await call('POST', `/wallet/admin/${partnerA.id}/adjust`, ta, { amount: 100, direction: 'credit', reason: 'paying myself a bonus' });
  ok('partner cannot adjust a wallet', r.status === 403, String(r.status));

  r = await call('POST', `/wallet/admin/${partnerA.id}/adjust`, tad, { amount: 100, direction: 'credit', reason: 'short' });
  ok('adjustment requires a substantive reason', r.status === 400, String(r.status));

  r = await call('POST', `/wallet/admin/${partnerA.id}/adjust`, tad, { amount: 100, direction: 'credit', reason: 'Goodwill credit for the delayed job' });
  ok('admin adjustment succeeds with a reason', r.status === 201, String(r.status));

  r = await call('GET', '/wallet/admin/outstanding', ta);
  ok('partner cannot read the commission report', r.status === 403, String(r.status));

  r = await call('GET', '/wallet/admin/outstanding', tad);
  ok('admin reads the commission report', r.status === 200 && Array.isArray(r.body), String(r.status));

  console.log('\nLedger integrity + method routing');
  r = await call('GET', `/wallet/admin/${partnerA.id}/reconcile`, tad);
  ok('ledger reconciles with stored balances', r.status === 200 && r.body?.matches === true, JSON.stringify(r.body?.computed || {}));

  r = await call('POST', '/payments/create', tc, { booking_id: booking.id, method: 'cash' });
  ok('cash is rejected at online checkout', r.status === 400, String(r.status));

  r = await call('POST', '/payments/create', tc, { booking_id: booking.id, method: 'bitcoin' });
  ok('unknown method fails validation', r.status === 400, String(r.status));

  r = await call('GET', '/payouts/wallet', ta);
  const legacyKeys = ['lifetime', 'pending', 'withdrawn', 'withdrawable', 'balance', 'currency'];
  ok('legacy /payouts/wallet keys are unchanged',
    r.status === 200 && legacyKeys.every((k) => k in r.body),
    legacyKeys.filter((k) => !(k in (r.body || {}))).join(',') || 'all present');
} catch (err) {
  console.error(`\n${err.message}`);
  failures += 1;
} finally {
  await cleanupAndReport([consumer, partnerA, partnerB, admin], booking);
  await prisma.$disconnect();
}

console.log(failures === 0 ? '\n✅ wallet API authorization smoke passed' : `\n❌ ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
