// ─────────────────────────────────────────────────────────────────────────────
// Legal acceptance smoke test — enforcement, evidence capture, immutability.
//
// Requires the API running (npm run dev:server):
//   node scripts/legal-smoke.mjs
// ─────────────────────────────────────────────────────────────────────────────
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { prisma } from '../server/db.js';
import { cleanupAndReport } from './smoke-cleanup.mjs';
import { pendingFor } from '../server/lib/legal/index.js';

const API = process.env.SMOKE_API_BASE || 'http://localhost:3001/api';
const tag = `legalsmoke-${Date.now()}`;
let failures = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) failures += 1;
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? ` — ${extra}` : ''}`);
};
const tokenFor = (u) => jwt.sign({ id: u.id, email: u.email, role: u.role }, process.env.JWT_SECRET, { expiresIn: '10m' });

async function call(method, path, token, body, headers = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

let consumer; let partner;

try {
  await fetch(`${API}/health`).catch(() => { throw new Error(`API not reachable at ${API} — run: npm run dev:server`); });

  consumer = await prisma.user.create({ data: { email: `${tag}-c@t.local`, fullName: 'Legal Smoke Consumer', role: 'consumer' } });
  partner = await prisma.user.create({ data: { email: `${tag}-p@t.local`, fullName: 'Legal Smoke Partner', role: 'partner' } });
  const tc = tokenFor(consumer);
  const tp = tokenFor(partner);

  console.log('\nPublic access');
  let r = await call('GET', '/legal/documents?audience=consumer', null);
  ok('documents readable without auth', r.status === 200 && r.body.length > 0, `${r.body?.length} docs`);

  r = await call('GET', '/legal/documents/customer_terms?locale=ms', null);
  ok('BM content served', r.status === 200 && r.body.title === 'Terma Perkhidmatan Pelanggan', r.body?.title);

  console.log('\nAudience scoping');
  const consumerPending = await pendingFor(consumer);
  const partnerPending = await pendingFor(partner);
  const slugs = (list) => list.map((d) => d.slug).sort();
  ok('consumer is not asked to accept partner terms', !slugs(consumerPending).includes('partner_terms'), slugs(consumerPending).join(','));
  ok('partner is not asked to accept customer terms', !slugs(partnerPending).includes('customer_terms'), slugs(partnerPending).join(','));
  ok('shared policies apply to both',
    slugs(consumerPending).includes('privacy_policy') && slugs(partnerPending).includes('privacy_policy'));

  console.log('\nEnforcement');
  r = await call('GET', '/bookings', tc);
  ok('reads stay open with terms outstanding', r.status === 200, String(r.status));

  r = await call('POST', '/bookings', tc, { service_type: 'x', price: 10, date: new Date().toISOString() });
  ok('creating is blocked with the right code', r.status === 403 && r.body?.code === 'legal_acceptance_required',
    `${r.status} ${r.body?.code || r.body?.error || ''}`);
  ok('the block names which documents are outstanding', Array.isArray(r.body?.documents) && r.body.documents.length > 0,
    `${r.body?.documents?.length} listed`);

  console.log('\nAcceptance');
  r = await call('GET', '/legal/pending', tc);
  const pendingDocs = r.body || [];
  r = await call('POST', '/legal/accept-many', tc, {
    documents: pendingDocs.map((d) => ({ slug: d.slug, version: d.version })),
    source: 'web',
  }, { 'User-Agent': 'SmokeTest/1.0', 'X-Forwarded-For': '203.0.113.42' });
  ok('acceptance recorded', r.status === 201 && r.body.length === pendingDocs.length, `${r.body?.length} accepted`);

  const stored = await prisma.legalAcceptance.findMany({ where: { userId: consumer.id } });
  ok('IP captured server-side from the request', stored.every((a) => a.ipAddress === '203.0.113.42'),
    stored[0]?.ipAddress || 'none');
  ok('user agent captured server-side', stored.every((a) => a.userAgent === 'SmokeTest/1.0'), stored[0]?.userAgent || 'none');
  ok('exact version recorded', stored.every((a) => a.version === '1.0'));

  r = await call('GET', '/legal/pending', tc);
  ok('nothing left pending after accepting', r.body.length === 0, `${r.body?.length} remaining`);

  r = await call('POST', '/bookings', tc, {});
  ok('creating is no longer blocked on legal grounds', r.body?.code !== 'legal_acceptance_required',
    `${r.status} ${r.body?.error || ''}`);

  console.log('\nIdempotency + immutability');
  const before = await prisma.legalAcceptance.count({ where: { userId: consumer.id } });
  await call('POST', '/legal/accept', tc, { slug: 'privacy_policy', version: '1.0' });
  const after = await prisma.legalAcceptance.count({ where: { userId: consumer.id } });
  ok('re-accepting does not duplicate the record', before === after, `${before} → ${after}`);

  const published = await prisma.legalDocument.findFirst({ where: { slug: 'customer_terms', isActive: true } });
  r = await call('PATCH', `/legal/documents/${published.id}`, tokenFor({ ...consumer, role: 'super_admin' }), { title: 'Tampered' });
  ok('a published document cannot be edited', r.status === 409, `${r.status} ${r.body?.error || ''}`);

  r = await call('DELETE', `/legal/acceptances/${stored[0].id}`, tokenFor({ ...consumer, role: 'super_admin' }));
  ok('no endpoint exists to delete an acceptance', r.status === 404, String(r.status));

  console.log('\nActive-version constraint');
  const actives = await prisma.legalDocument.groupBy({ by: ['slug'], where: { isActive: true }, _count: true });
  ok('exactly one active version per document', actives.every((a) => a._count === 1),
    actives.map((a) => `${a.slug}:${a._count}`).join(' '));
} catch (err) {
  console.error(`\n${err.stack || err.message}`);
  failures += 1;
} finally {
  const ids = [consumer, partner].filter(Boolean).map((u) => u.id);
  if (ids.length) await prisma.legalAcceptance.deleteMany({ where: { userId: { in: ids } } });
  await cleanupAndReport([consumer, partner]);
  await prisma.$disconnect();
}

console.log(failures === 0 ? '\n✅ legal smoke passed' : `\n❌ ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
