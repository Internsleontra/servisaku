import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, ApiError, isAdmin } from '../lib/access.js';
import { issueCreditNote, mapInvoiceOut } from '../lib/tax/invoice.js';
import { sstReport, sstReportRows, toCsv } from '../lib/tax/report.js';
import { taxSummary, supersede, TAX_CODES } from '../lib/tax/index.js';

const router = Router();
router.use(authenticate);

// An invoice is readable by the party it names, plus admin. Nobody else.
function assertInvoiceAccess(user, invoice) {
  if (isAdmin(user)) return;
  if (invoice.consumerId === user.id) return;
  if (invoice.partnerId === user.id) return;
  throw new ApiError(403, 'Forbidden');
}

// GET /api/invoices — scoped: consumer sees their own, partner sees commission
// invoices raised against them, admin sees everything.
router.get('/', asyncHandler(async (req, res) => {
  const where = isAdmin(req.user)
    ? {}
    : { OR: [{ consumerId: req.user.id }, { partnerId: req.user.id }] };
  if (req.query.type) where.type = String(req.query.type);
  if (req.query.booking_id) where.bookingId = String(req.query.booking_id);

  const items = await prisma.invoice.findMany({
    where,
    orderBy: { issuedAt: 'desc' },
    take: Math.min(Number(req.query.limit) || 100, 500),
  });
  res.json(items.map(mapInvoiceOut));
}));

// ─── Admin reporting (declared before /:id so the paths aren't shadowed) ─────

// GET /api/invoices/admin/tax-report?from=&to=
router.get('/admin/tax-report', requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  const from = req.query.from
    ? new Date(String(req.query.from))
    : new Date(to.getFullYear(), to.getMonth() - 1, 1);
  res.json(await sstReport(from, to));
}));

// GET /api/invoices/admin/tax-report/export?from=&to= → CSV for the accountant
router.get('/admin/tax-report/export', requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  const from = req.query.from
    ? new Date(String(req.query.from))
    : new Date(to.getFullYear(), to.getMonth() - 1, 1);
  const csv = toCsv(await sstReportRows(from, to));
  const name = `sst-${from.toISOString().slice(0, 10)}-to-${to.toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(csv);
}));

// GET /api/invoices/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice) throw new ApiError(404, 'Invoice not found');
  assertInvoiceAccess(req.user, invoice);
  res.json(mapInvoiceOut(invoice));
}));

// POST /api/invoices/:id/credit-note — admin issues a correction. There is no
// invoice update endpoint by design: an issued invoice is immutable.
const creditSchema = z.object({
  amount: z.coerce.number().positive(),
  reason: z.string().min(5).max(500),
});
router.post('/:id/credit-note', requireRole('admin', 'super_admin'), validate(creditSchema), asyncHandler(async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice) throw new ApiError(404, 'Invoice not found');
  if (invoice.type !== 'tax_invoice') throw new ApiError(400, 'Credit notes may only be issued against a tax invoice');

  try {
    const note = await issueCreditNote(invoice.id, req.body.amount, { reason: req.body.reason });
    res.status(201).json(mapInvoiceOut(note));
  } catch (err) {
    throw new ApiError(400, err.message);
  }
}));

export default router;

// ─── Tax configuration (mounted separately at /api/tax) ──────────────────────
export const taxRouter = Router();

// GET /api/tax/config — public. The client must never hardcode a rate; this is
// where it reads one. (Fixes the 6% vs 8% split between the front end and the
// pricing engine.)
taxRouter.get('/config', asyncHandler(async (req, res) => {
  const code = req.query.code === TAX_CODES.COMMISSION ? TAX_CODES.COMMISSION : TAX_CODES.SERVICE;
  res.json(await taxSummary(code));
}));

// PATCH /api/tax/config — supersede the rate. super_admin only: changing this
// changes what every future customer is charged.
const configSchema = z.object({
  code: z.enum([TAX_CODES.SERVICE, TAX_CODES.COMMISSION]).default(TAX_CODES.SERVICE),
  rate: z.coerce.number().min(0).max(1),
  registration_no: z.string().max(50).nullish(),
  applies_to: z.array(z.string()).nullish(),
  is_inclusive: z.boolean().optional(),
  effective_from: z.coerce.date().optional(),
  notes: z.string().max(500).nullish(),
});
taxRouter.patch('/config', authenticate, requireRole('super_admin'), validate(configSchema), asyncHandler(async (req, res) => {
  const created = await supersede(req.body.code, {
    rate: req.body.rate,
    registrationNo: req.body.registration_no ?? undefined,
    appliesTo: req.body.applies_to ?? undefined,
    isInclusive: req.body.is_inclusive,
    effectiveFrom: req.body.effective_from,
    notes: req.body.notes ?? undefined,
  });
  res.status(201).json({
    id: created.id, code: created.code, rate: created.rate,
    rate_percent: Number((created.rate * 100).toFixed(2)),
    registration_no: created.registrationNo, is_inclusive: created.isInclusive,
    effective_from: created.effectiveFrom,
  });
}));
