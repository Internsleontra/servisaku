import { Router } from 'express';
import { localeOf } from '../lib/locale.js';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, ApiError } from '../lib/access.js';
import {
  SLUGS, activeDocuments, activeBySlug, pendingFor, accept, publish,
  reacceptanceImpact, mapDocumentOut, mapAcceptanceOut,
} from '../lib/legal/index.js';

// Public reads. A policy behind a login wall is arguably not disclosed at all,
// so these are deliberately unauthenticated.
const router = Router();


router.get('/legal/documents', asyncHandler(async (req, res) => {
  const audience = ['consumer', 'partner'].includes(String(req.query.audience)) ? String(req.query.audience) : 'consumer';
  const docs = await activeDocuments(audience);
  res.json(docs.map((d) => mapDocumentOut(d, { locale: localeOf(req) })));
}));

router.get('/legal/documents/:slug', asyncHandler(async (req, res) => {
  if (!SLUGS.includes(req.params.slug)) throw new ApiError(404, 'Unknown document');
  const doc = await activeBySlug(req.params.slug);
  if (!doc) throw new ApiError(404, 'This document has not been published yet');
  res.json(mapDocumentOut(doc, { full: true, locale: localeOf(req) }));
}));

// ─── Authenticated ───────────────────────────────────────────────────────────
export const legalAuthRouter = Router();
legalAuthRouter.use(authenticate);

// GET /api/legal/pending — what this user still has to accept.
legalAuthRouter.get('/pending', asyncHandler(async (req, res) => {
  const pending = await pendingFor(req.user);
  res.json(pending.map((d) => mapDocumentOut(d, { full: true, locale: localeOf(req) })));
}));

const acceptSchema = z.object({
  slug: z.enum(SLUGS),
  version: z.string().min(1).max(20),
  source: z.enum(['web', 'mobile_consumer', 'mobile_partner', 'onboarding', 'api']).default('web'),
  locale: z.enum(['en', 'ms']).default('en'),
  // NOTE: no ip/user_agent field. Those are read from the request itself —
  // a client-supplied value would not be evidence of anything.
});
legalAuthRouter.post('/accept', validate(acceptSchema), asyncHandler(async (req, res) => {
  try {
    const acceptance = await accept(req.user, req.body, req);
    res.status(201).json(mapAcceptanceOut(acceptance));
  } catch (err) {
    throw new ApiError(400, err.message);
  }
}));

// Accept several at once — signup presents terms and privacy policy together.
const acceptManySchema = z.object({
  documents: z.array(z.object({ slug: z.enum(SLUGS), version: z.string().min(1).max(20) })).min(1).max(10),
  source: z.enum(['web', 'mobile_consumer', 'mobile_partner', 'onboarding', 'api']).default('web'),
  locale: z.enum(['en', 'ms']).default('en'),
});
legalAuthRouter.post('/accept-many', validate(acceptManySchema), asyncHandler(async (req, res) => {
  const out = [];
  for (const d of req.body.documents) {
    try {
      out.push(mapAcceptanceOut(await accept(req.user, { ...d, source: req.body.source, locale: req.body.locale }, req)));
    } catch (err) {
      throw new ApiError(400, err.message);
    }
  }
  res.status(201).json(out);
}));

legalAuthRouter.get('/acceptances', asyncHandler(async (req, res) => {
  const items = await prisma.legalAcceptance.findMany({
    where: { userId: req.user.id }, orderBy: { acceptedAt: 'desc' },
  });
  res.json(items.map(mapAcceptanceOut));
}));

// ─── Admin ───────────────────────────────────────────────────────────────────

legalAuthRouter.get('/documents/:slug/versions', requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  const items = await prisma.legalDocument.findMany({
    where: { slug: req.params.slug }, orderBy: { effectiveFrom: 'desc' },
  });
  res.json(items.map((d) => mapDocumentOut(d)));
}));

const createSchema = z.object({
  slug: z.enum(SLUGS),
  version: z.string().min(1).max(20),
  title: z.string().min(3).max(200),
  title_my: z.string().min(3).max(200),
  content_md: z.string().min(50),
  content_md_my: z.string().min(50),
  summary: z.string().max(1000).nullish(),
  summary_my: z.string().max(1000).nullish(),
  audience: z.enum(['consumer', 'partner', 'all']).default('consumer'),
  requires_acceptance: z.boolean().default(true),
  effective_from: z.coerce.date(),
});
legalAuthRouter.post('/documents', requireRole('admin', 'super_admin'), validate(createSchema), asyncHandler(async (req, res) => {
  const existing = await prisma.legalDocument.findUnique({
    where: { slug_version: { slug: req.body.slug, version: req.body.version } },
  });
  if (existing) throw new ApiError(409, `Version ${req.body.version} of ${req.body.slug} already exists`);

  const doc = await prisma.legalDocument.create({
    data: {
      slug: req.body.slug,
      version: req.body.version,
      title: req.body.title,
      titleMy: req.body.title_my,
      contentMd: req.body.content_md,
      contentMdMy: req.body.content_md_my,
      summary: req.body.summary ?? null,
      summaryMy: req.body.summary_my ?? null,
      audience: req.body.audience,
      requiresAcceptance: req.body.requires_acceptance,
      effectiveFrom: req.body.effective_from,
      isActive: false, // drafts are never live until published
    },
  });
  res.status(201).json(mapDocumentOut(doc, { full: true }));
}));

const patchSchema = createSchema.partial().omit({ slug: true, version: true });
legalAuthRouter.patch('/documents/:id', requireRole('admin', 'super_admin'), validate(patchSchema), asyncHandler(async (req, res) => {
  const doc = await prisma.legalDocument.findUnique({ where: { id: req.params.id } });
  if (!doc) throw new ApiError(404, 'Document not found');
  // Immutability is the whole basis of the acceptance log — a published version
  // can never be edited, only superseded.
  if (doc.publishedAt) throw new ApiError(409, 'A published version cannot be edited — create a new version instead');

  const map = {
    title: 'title', title_my: 'titleMy', content_md: 'contentMd', content_md_my: 'contentMdMy',
    summary: 'summary', summary_my: 'summaryMy', audience: 'audience',
    requires_acceptance: 'requiresAcceptance', effective_from: 'effectiveFrom',
  };
  const data = {};
  for (const [from, to] of Object.entries(map)) if (req.body[from] !== undefined) data[to] = req.body[from];

  const updated = await prisma.legalDocument.update({ where: { id: doc.id }, data });
  res.json(mapDocumentOut(updated, { full: true }));
}));

// GET the blast radius before publishing, so nobody force-reaccepts 40,000
// users by accident.
legalAuthRouter.get('/documents/:id/impact', requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  const doc = await prisma.legalDocument.findUnique({ where: { id: req.params.id } });
  if (!doc) throw new ApiError(404, 'Document not found');
  res.json({
    slug: doc.slug,
    version: doc.version,
    requires_acceptance: doc.requiresAcceptance,
    users_affected: doc.requiresAcceptance ? await reacceptanceImpact(doc.slug, doc.audience) : 0,
  });
}));

legalAuthRouter.post('/documents/:id/publish', requireRole('super_admin'), asyncHandler(async (req, res) => {
  try {
    const published = await publish(req.params.id, req.user.id);
    res.json(mapDocumentOut(published));
  } catch (err) {
    throw new ApiError(400, err.message);
  }
}));

// Compliance report. There is deliberately no endpoint anywhere that updates or
// deletes an acceptance.
legalAuthRouter.get('/admin/acceptances', requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.slug) where.slug = String(req.query.slug);
  if (req.query.version) where.version = String(req.query.version);
  const items = await prisma.legalAcceptance.findMany({
    where,
    orderBy: { acceptedAt: 'desc' },
    take: Math.min(Number(req.query.limit) || 500, 2000),
    include: { user: { select: { email: true, fullName: true, role: true } } },
  });
  res.json(items.map((a) => ({
    ...mapAcceptanceOut(a),
    user_id: a.userId,
    user_email: a.user?.email ?? null,
    user_name: a.user?.fullName ?? null,
    user_role: a.user?.role ?? null,
    // Audit fields are admin-only, which is why they appear here and not in the
    // user-facing mapper.
    ip_address: a.ipAddress,
    user_agent: a.userAgent,
  })));
}));

export default router;
