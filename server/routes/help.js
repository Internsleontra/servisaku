// Public help centre. Mounted alongside the catalog router (no auth), because a
// help article behind a login wall cannot help someone who can't log in.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, ApiError } from '../lib/access.js';

const router = Router();

const audienceFilter = (q) => {
  const audience = ['consumer', 'partner'].includes(String(q.audience)) ? String(q.audience) : 'consumer';
  return { OR: [{ audience }, { audience: 'all' }] };
};

router.get('/help/categories', asyncHandler(async (req, res) => {
  const items = await prisma.helpCategory.findMany({
    where: { isActive: true, ...audienceFilter(req.query) },
    orderBy: { sortOrder: 'asc' },
    include: { articles: { where: { isPublished: true }, select: { id: true } } },
  });
  res.json(items.map((c) => ({
    id: c.id, slug: c.slug, name: c.name, name_my: c.nameMy,
    icon_key: c.iconKey, audience: c.audience, article_count: c.articles.length,
  })));
}));

function mapArticle(a, { full = false } = {}) {
  return {
    id: a.id,
    slug: a.slug,
    category_id: a.categoryId,
    title: a.title,
    title_my: a.titleMy,
    audience: a.audience,
    tags: a.tags ?? null,
    view_count: a.viewCount,
    helpful_count: a.helpfulCount,
    not_helpful_count: a.notHelpfulCount,
    ...(full ? { body_md: a.bodyMd, body_md_my: a.bodyMdMy } : {}),
  };
}

router.get('/help/articles', asyncHandler(async (req, res) => {
  const where = { isPublished: true, ...audienceFilter(req.query) };
  if (req.query.category) {
    const category = await prisma.helpCategory.findUnique({ where: { slug: String(req.query.category) } });
    where.categoryId = category?.id ?? '__none__';
  }
  const items = await prisma.helpArticle.findMany({ where, orderBy: { sortOrder: 'asc' }, take: 200 });
  res.json(items.map((a) => mapArticle(a)));
}));

// Search across both languages so a BM query finds a BM article.
router.get('/help/search', asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  const items = await prisma.helpArticle.findMany({
    where: {
      isPublished: true,
      ...audienceFilter(req.query),
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { titleMy: { contains: q, mode: 'insensitive' } },
        { bodyMd: { contains: q, mode: 'insensitive' } },
        { bodyMdMy: { contains: q, mode: 'insensitive' } },
      ],
    },
    take: 20,
  });
  res.json(items.map((a) => mapArticle(a)));
}));

router.get('/help/articles/:slug', asyncHandler(async (req, res) => {
  const article = await prisma.helpArticle.findUnique({ where: { slug: req.params.slug } });
  if (!article || !article.isPublished) throw new ApiError(404, 'Article not found');
  // Fire-and-forget: a failed counter must never break the read.
  prisma.helpArticle.update({
    where: { id: article.id }, data: { viewCount: { increment: 1 } },
  }).catch(() => {});
  res.json(mapArticle(article, { full: true }));
}));

const feedbackSchema = z.object({ helpful: z.boolean() });
router.post('/help/articles/:slug/feedback', validate(feedbackSchema), asyncHandler(async (req, res) => {
  const article = await prisma.helpArticle.findUnique({ where: { slug: req.params.slug } });
  if (!article) throw new ApiError(404, 'Article not found');
  const updated = await prisma.helpArticle.update({
    where: { id: article.id },
    data: req.body.helpful
      ? { helpfulCount: { increment: 1 } }
      : { notHelpfulCount: { increment: 1 } },
  });
  res.json({ helpful_count: updated.helpfulCount, not_helpful_count: updated.notHelpfulCount });
}));

export default router;
