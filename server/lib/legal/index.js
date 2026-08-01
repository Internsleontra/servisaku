// ─────────────────────────────────────────────────────────────────────────────
// Legal documents and acceptance.
//
// Two rules do the heavy lifting:
//   1. A published document is immutable. A change is a new version row, which
//      is what makes an acceptance meaningful — "accepted v1.2" only means
//      something if v1.2 can never be edited afterwards.
//   2. IP and user agent are captured server-side. Taking them from the request
//      body would let the client write its own evidence, making the log
//      worthless in exactly the situation it exists for.
// ─────────────────────────────────────────────────────────────────────────────
import { prisma } from '../../db.js';

export const SLUGS = Object.freeze([
  'customer_terms', 'partner_terms', 'privacy_policy',
  'refund_policy', 'cancellation_policy', 'damage_policy',
]);

/** Documents in force for an audience. `all` applies to everyone. */
export async function activeDocuments(audience = 'consumer', at = new Date()) {
  return prisma.legalDocument.findMany({
    where: {
      isActive: true,
      effectiveFrom: { lte: at },
      OR: [{ audience }, { audience: 'all' }],
    },
    orderBy: { slug: 'asc' },
  });
}

export async function activeBySlug(slug, at = new Date()) {
  return prisma.legalDocument.findFirst({
    where: { slug, isActive: true, effectiveFrom: { lte: at } },
    orderBy: { effectiveFrom: 'desc' },
  });
}

/**
 * Which documents this user still has to accept.
 *
 * A typo fix (`requiresAcceptance: false`) never prompts — prompting for one is
 * how users learn to click through these without reading.
 */
export async function pendingFor(user, at = new Date()) {
  if (!user?.id) return [];
  const audience = user.role === 'partner' ? 'partner' : 'consumer';
  const documents = (await activeDocuments(audience, at)).filter((d) => d.requiresAcceptance);
  if (documents.length === 0) return [];

  const accepted = await prisma.legalAcceptance.findMany({
    where: { userId: user.id, documentId: { in: documents.map((d) => d.id) } },
    select: { documentId: true },
  });
  const acceptedIds = new Set(accepted.map((a) => a.documentId));
  return documents.filter((d) => !acceptedIds.has(d.id));
}

/**
 * Record an acceptance.
 *
 * `req` is used only to read the IP and user agent — never the body. The unique
 * constraint on (userId, documentId) makes a double-submit idempotent rather
 * than an error.
 */
export async function accept(user, { slug, version, source = 'web', locale = 'en' }, req) {
  const document = await prisma.legalDocument.findUnique({
    where: { slug_version: { slug, version } },
  });
  if (!document) throw new Error(`Document ${slug} v${version} not found`);
  if (!document.isActive) throw new Error('That version is no longer current — please accept the current one');

  const existing = await prisma.legalAcceptance.findUnique({
    where: { userId_documentId: { userId: user.id, documentId: document.id } },
  });
  if (existing) return existing;

  return prisma.legalAcceptance.create({
    data: {
      userId: user.id,
      documentId: document.id,
      slug: document.slug,
      version: document.version,
      // Server-side, always. A client-supplied IP is not evidence.
      ipAddress: clientIp(req),
      userAgent: String(req?.headers?.['user-agent'] || '').slice(0, 500) || null,
      source,
      locale,
    },
  });
}

function clientIp(req) {
  if (!req) return null;
  // Express sets req.ip; behind a proxy it needs `trust proxy`, so fall back to
  // the forwarded header's first hop.
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return (forwarded || req.ip || req.socket?.remoteAddress || null)?.slice(0, 60) ?? null;
}

/**
 * Publish a draft: activate it and deactivate the previous version, atomically.
 * The transaction is what guarantees "exactly one active version per slug".
 */
export async function publish(documentId, publishedById) {
  const draft = await prisma.legalDocument.findUnique({ where: { id: documentId } });
  if (!draft) throw new Error('Document not found');
  if (draft.publishedAt) throw new Error('This version is already published — create a new version instead');

  return prisma.$transaction(async (tx) => {
    await tx.legalDocument.updateMany({
      where: { slug: draft.slug, isActive: true },
      data: { isActive: false },
    });
    return tx.legalDocument.update({
      where: { id: documentId },
      data: { isActive: true, publishedAt: new Date(), publishedById },
    });
  });
}

/** How many users a publish would force to re-accept — shown before confirming. */
export async function reacceptanceImpact(slug, audience) {
  if (audience === 'all') return prisma.user.count({ where: { role: { in: ['consumer', 'partner'] } } });
  return prisma.user.count({ where: { role: audience === 'partner' ? 'partner' : 'consumer' } });
}

export function mapDocumentOut(d, { full = false, locale = 'en' } = {}) {
  return {
    id: d.id,
    slug: d.slug,
    version: d.version,
    title: locale === 'ms' ? d.titleMy : d.title,
    title_en: d.title,
    title_my: d.titleMy,
    summary: locale === 'ms' ? d.summaryMy : d.summary,
    audience: d.audience,
    requires_acceptance: d.requiresAcceptance,
    is_active: d.isActive,
    effective_from: d.effectiveFrom,
    published_at: d.publishedAt,
    ...(full ? { content_md: locale === 'ms' ? d.contentMdMy : d.contentMd, content_md_en: d.contentMd, content_md_my: d.contentMdMy } : {}),
  };
}

export function mapAcceptanceOut(a) {
  return {
    id: a.id,
    slug: a.slug,
    version: a.version,
    accepted_at: a.acceptedAt,
    source: a.source,
    locale: a.locale,
    // IP is deliberately not returned to the user themselves — it is audit data.
  };
}
