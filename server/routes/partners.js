import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, ApiError } from '../lib/access.js';
import { COURSE_CATALOG, publicCourse, gradeQuiz } from '../lib/trainingCatalog.js';

const router = Router();
router.use(authenticate);

// Sensible defaults — returned (merged) so the UI always has a full object.
const DEFAULTS = {
  working_days: [1, 2, 3, 4, 5],          // 0=Sun … 6=Sat
  start_time: '09:00',
  end_time: '18:00',
  lunch: { enabled: false, start: '13:00', end: '14:00' },
  vacation_mode: false,
  instant_booking: true,
  max_daily_jobs: 6,
  coverage_radius_km: 10,
  preferred_areas: [],
  preferred_categories: [],
  unavailable_dates: [],
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const availabilitySchema = z.object({
  working_days: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  start_time: z.string().regex(TIME).optional(),
  end_time: z.string().regex(TIME).optional(),
  lunch: z.object({
    enabled: z.boolean(),
    start: z.string().regex(TIME),
    end: z.string().regex(TIME),
  }).optional(),
  vacation_mode: z.boolean().optional(),
  instant_booking: z.boolean().optional(),
  max_daily_jobs: z.number().int().min(1).max(50).optional(),
  coverage_radius_km: z.number().int().min(1).max(200).optional(),
  preferred_areas: z.array(z.string().max(80)).max(50).optional(),
  preferred_categories: z.array(z.string().max(80)).max(50).optional(),
  unavailable_dates: z.array(z.string().regex(DATE)).max(365).optional(),
});

function assertPartner(req) {
  if (req.user.role !== 'partner') throw new ApiError(403, 'Partners only');
}

// GET /api/partners/me/availability
router.get('/me/availability', asyncHandler(async (req, res) => {
  assertPartner(req);
  const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { availability: true } });
  res.json({ ...DEFAULTS, ...(u?.availability || {}) });
}));

// PATCH /api/partners/me/availability — partial update, merged onto current config.
router.patch('/me/availability', validate(availabilitySchema), asyncHandler(async (req, res) => {
  assertPartner(req);
  const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { availability: true } });
  const next = { ...DEFAULTS, ...(u?.availability || {}), ...req.body };
  const saved = await prisma.user.update({
    where: { id: req.user.id },
    data: { availability: next },
    select: { availability: true },
  });
  res.json(saved.availability);
}));

// ─── Verification documents (Malaysia) ──────────────────────────────────────
// Catalogue of accepted documents. `required` ones drive the activation %.
const DOC_CATALOG = [
  { type: 'mykad', label: 'MyKad (NRIC)', group: 'Identity', required: true, hasNumber: true, numberLabel: 'IC number', hasExpiry: false, help: 'Upload front & back of your MyKad.' },
  { type: 'selfie', label: 'Selfie verification', group: 'Identity', required: true, hasNumber: false, hasExpiry: false, help: 'A clear selfie to match against your MyKad.' },
  { type: 'skill_cert', label: 'Skills certificate', group: 'Professional', required: true, hasNumber: true, numberLabel: 'Certificate / licence no.', hasExpiry: true, help: 'CIDB Green Card, Suruhanjaya Tenaga competency (Chargeman/Wireman), SPAN plumber licence, etc.' },
  { type: 'insurance', label: 'Public liability insurance', group: 'Professional', required: true, hasNumber: true, numberLabel: 'Policy number', hasExpiry: true, help: 'Covers accidental damage during jobs.' },
  { type: 'bank', label: 'Bank account', group: 'Financial', required: true, hasNumber: true, numberLabel: 'Account number', hasExpiry: false, help: 'Malaysian bank account for payouts.' },
  { type: 'ssm', label: 'SSM business registration', group: 'Business', required: false, hasNumber: true, numberLabel: 'SSM no.', hasExpiry: false, help: 'If you operate as a registered business (Sdn Bhd / Enterprise).' },
  { type: 'driving_licence', label: 'Driving licence (JPJ)', group: 'Business', required: false, hasNumber: true, numberLabel: 'Licence no.', hasExpiry: true, help: 'If your service requires driving.' },
  { type: 'lhdn', label: 'Income tax (LHDN)', group: 'Financial', required: false, hasNumber: true, numberLabel: 'Tax no.', hasExpiry: false, help: 'For tax reporting.' },
];
const DOC_TYPES = DOC_CATALOG.map((d) => d.type);

// Malaysia-specific number validation/normalisation.
function validateDocNumber(type, number) {
  if (type === 'mykad') {
    const digits = String(number || '').replace(/\D/g, '');
    if (digits.length !== 12) throw new ApiError(400, 'IC number must be 12 digits (e.g. 900101-14-5567)');
    return `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
  }
  if (type === 'ssm') {
    const v = String(number || '').trim();
    if (!/^[A-Za-z0-9-]{6,20}$/.test(v)) throw new ApiError(400, 'Invalid SSM registration number');
    return v;
  }
  return number ? String(number).trim() : null;
}

async function buildDocSummary(partnerId) {
  const rows = await prisma.partnerDocument.findMany({ where: { partnerId } });
  const byType = Object.fromEntries(rows.map((r) => [r.type, r]));
  const now = new Date();
  const documents = DOC_CATALOG.map((cat) => {
    const r = byType[cat.type];
    let status = r ? r.status : 'missing';
    if (r && r.expiryDate && new Date(r.expiryDate) < now && status !== 'rejected') status = 'expired';
    return {
      ...cat,
      status,
      file_url: r?.fileUrl ?? null,
      number: r?.number ?? null,
      expiry_date: r?.expiryDate ?? null,
      rejection_reason: r?.rejectionReason ?? null,
      verified_at: r?.verifiedAt ?? null,
      updated_at: r?.updatedAt ?? null,
    };
  });
  const required = documents.filter((d) => d.required);
  const requiredVerified = required.filter((d) => d.status === 'verified').length;
  return {
    documents,
    required_total: required.length,
    required_verified: requiredVerified,
    progress: required.length ? Math.round((requiredVerified / required.length) * 100) : 100,
    activated: requiredVerified === required.length,
  };
}

// GET /api/partners/me/documents — catalogue merged with the partner's submissions + summary.
router.get('/me/documents', asyncHandler(async (req, res) => {
  assertPartner(req);
  res.json(await buildDocSummary(req.user.id));
}));

// POST /api/partners/me/documents — submit/replace a document (→ pending review).
const docSchema = z.object({
  type: z.enum(DOC_TYPES),
  file_url: z.string().max(2000).optional(),
  number: z.string().max(60).optional(),
  expiry_date: z.string().regex(DATE).optional(),
});
router.post('/me/documents', validate(docSchema), asyncHandler(async (req, res) => {
  assertPartner(req);
  const cat = DOC_CATALOG.find((d) => d.type === req.body.type);
  const number = cat.hasNumber ? validateDocNumber(req.body.type, req.body.number) : null;
  if (!req.body.file_url && !number) throw new ApiError(400, 'Attach a file or enter the required number');
  const data = {
    status: 'pending',
    fileUrl: req.body.file_url ?? null,
    number,
    expiryDate: req.body.expiry_date ? new Date(req.body.expiry_date) : null,
    rejectionReason: null,
    verifiedAt: null,
  };
  await prisma.partnerDocument.upsert({
    where: { partnerId_type: { partnerId: req.user.id, type: req.body.type } },
    create: { partnerId: req.user.id, type: req.body.type, ...data },
    update: data,
  });
  res.json(await buildDocSummary(req.user.id));
}));

// ─── Training Center ─────────────────────────────────────────────────────────
async function buildTraining(partnerId) {
  const rows = await prisma.trainingProgress.findMany({ where: { partnerId } });
  const byId = Object.fromEntries(rows.map((r) => [r.courseId, r]));
  const courses = COURSE_CATALOG.map((c) => publicCourse(c, byId[c.id]));
  const mandatory = courses.filter((c) => c.mandatory);
  const mandatoryDone = mandatory.filter((c) => c.status === 'completed').length;
  const completed = courses.filter((c) => c.status === 'completed').length;
  return {
    courses,
    total: courses.length,
    completed,
    mandatory_total: mandatory.length,
    mandatory_completed: mandatoryDone,
    certified: mandatoryDone === mandatory.length,
    progress: courses.length ? Math.round((completed / courses.length) * 100) : 0,
  };
}

// GET /api/partners/me/training — catalogue + the partner's progress + summary.
router.get('/me/training', asyncHandler(async (req, res) => {
  assertPartner(req);
  res.json(await buildTraining(req.user.id));
}));

// POST /api/partners/me/training/:courseId/complete — grade quiz (server-side) & record.
const completeSchema = z.object({ answers: z.array(z.number().int().min(0).max(10)).max(20).optional() });
router.post('/me/training/:courseId/complete', validate(completeSchema), asyncHandler(async (req, res) => {
  assertPartner(req);
  const course = COURSE_CATALOG.find((c) => c.id === req.params.courseId);
  if (!course) throw new ApiError(404, 'Course not found');
  const { passed, score } = gradeQuiz(course, req.body.answers || []);
  if (!passed) {
    return res.json({ passed: false, score, ...(await buildTraining(req.user.id)) });
  }
  await prisma.trainingProgress.upsert({
    where: { partnerId_courseId: { partnerId: req.user.id, courseId: course.id } },
    create: { partnerId: req.user.id, courseId: course.id, status: 'completed', score, completedAt: new Date() },
    update: { status: 'completed', score, completedAt: new Date() },
  });
  res.json({ passed: true, score, ...(await buildTraining(req.user.id)) });
}));

// ─── Inventory ───────────────────────────────────────────────────────────────
function mapItem(i) {
  return {
    id: i.id, name: i.name, type: i.type, qty: i.qty, unit: i.unit,
    low_stock_threshold: i.lowStockThreshold,
    low_stock: i.qty <= i.lowStockThreshold,
    updated_at: i.updatedAt,
  };
}

router.get('/me/inventory', asyncHandler(async (req, res) => {
  assertPartner(req);
  const items = await prisma.inventoryItem.findMany({ where: { partnerId: req.user.id }, orderBy: { name: 'asc' } });
  res.json(items.map(mapItem));
}));

const itemSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(['product', 'consumable', 'equipment']),
  qty: z.number().int().min(0).max(100000).optional(),
  unit: z.string().max(20).optional(),
  low_stock_threshold: z.number().int().min(0).max(100000).optional(),
});
router.post('/me/inventory', validate(itemSchema), asyncHandler(async (req, res) => {
  assertPartner(req);
  const item = await prisma.inventoryItem.create({
    data: {
      partnerId: req.user.id,
      name: req.body.name,
      type: req.body.type,
      qty: req.body.qty ?? 0,
      unit: req.body.unit ?? null,
      lowStockThreshold: req.body.low_stock_threshold ?? 0,
    },
  });
  res.status(201).json(mapItem(item));
}));

const itemPatchSchema = z.object({
  qty: z.number().int().min(0).max(100000).optional(),
  name: z.string().min(1).max(120).optional(),
  unit: z.string().max(20).nullish(),
  low_stock_threshold: z.number().int().min(0).max(100000).optional(),
});
router.patch('/me/inventory/:id', validate(itemPatchSchema), asyncHandler(async (req, res) => {
  assertPartner(req);
  const existing = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.partnerId !== req.user.id) throw new ApiError(404, 'Item not found');
  const data = {};
  if (req.body.qty !== undefined) data.qty = req.body.qty;
  if (req.body.name !== undefined) data.name = req.body.name;
  if (req.body.unit !== undefined) data.unit = req.body.unit;
  if (req.body.low_stock_threshold !== undefined) data.lowStockThreshold = req.body.low_stock_threshold;
  const item = await prisma.inventoryItem.update({ where: { id: req.params.id }, data });
  res.json(mapItem(item));
}));

router.delete('/me/inventory/:id', asyncHandler(async (req, res) => {
  assertPartner(req);
  const existing = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.partnerId !== req.user.id) throw new ApiError(404, 'Item not found');
  await prisma.inventoryItem.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

// ─── Onboarding (registration profile + drafts) ─────────────────────────────
router.get('/me/onboarding', asyncHandler(async (req, res) => {
  assertPartner(req);
  const u = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { onboardingDraft: true, partnerProfile: true, onboardedAt: true, fullName: true, phone: true, email: true },
  });
  res.json({
    draft: u?.onboardingDraft || null,
    profile: u?.partnerProfile || null,
    submitted: !!u?.onboardedAt,
    onboarded_at: u?.onboardedAt || null,
    account: { full_name: u?.fullName, phone: u?.phone, email: u?.email },
  });
}));

// PATCH /me/onboarding/draft — body is the partial draft; merged onto current.
router.patch('/me/onboarding/draft', validate(z.record(z.any())), asyncHandler(async (req, res) => {
  assertPartner(req);
  const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { onboardingDraft: true } });
  const next = { ...(u?.onboardingDraft || {}), ...req.body };
  await prisma.user.update({ where: { id: req.user.id }, data: { onboardingDraft: next } });
  res.json({ ok: true, draft: next });
}));

const submitSchema = z.object({
  full_name: z.string().min(2).max(120).optional(),
  phone: z.string().max(30).optional(),
  city: z.string().max(100).optional(),
  gender: z.string().max(20).optional(),
  dob: z.string().max(20).optional(),
  bio: z.string().max(2000).optional(),
  experience_years: z.number().int().min(0).max(70).optional(),
  skills: z.array(z.string().max(60)).max(40).optional(),
  categories: z.array(z.string().max(80)).max(40).optional(),
  languages: z.array(z.string().max(40)).max(20).optional(),
  service_areas: z.array(z.string().max(80)).max(50).optional(),
  coverage_radius_km: z.number().int().min(1).max(200).optional(),
  vehicle_type: z.string().max(40).optional(),
  business_name: z.string().max(120).optional(),
  bank_name: z.string().max(60).optional(),
  bank_account: z.string().max(60).optional(),
  ic_number: z.string().max(40).optional(),
  tax_number: z.string().max(60).optional(),
  portfolio: z.array(z.object({ url: z.string().max(2000), caption: z.string().max(140).optional() })).max(30).optional(),
});
router.post('/me/onboarding/submit', validate(submitSchema), asyncHandler(async (req, res) => {
  assertPartner(req);
  const b = req.body;
  const profile = {
    gender: b.gender ?? null, dob: b.dob ?? null, experience_years: b.experience_years ?? null,
    skills: b.skills ?? [], categories: b.categories ?? [], languages: b.languages ?? [],
    service_areas: b.service_areas ?? [], coverage_radius_km: b.coverage_radius_km ?? null,
    vehicle_type: b.vehicle_type ?? null, business_name: b.business_name ?? null,
    bank_name: b.bank_name ?? null, ic_number: b.ic_number ?? null, tax_number: b.tax_number ?? null,
    portfolio: b.portfolio ?? [],
  };
  const current = await prisma.user.findUnique({ where: { id: req.user.id }, select: { availability: true } });
  const avail = (current?.availability && typeof current.availability === 'object') ? current.availability : {};
  const data = {
    partnerProfile: profile,
    onboardingDraft: null,
    onboardedAt: new Date(),
    // Onboarding feeds the availability config so matching has areas/categories.
    availability: {
      ...avail,
      preferred_areas: b.service_areas ?? avail.preferred_areas ?? [],
      preferred_categories: b.categories ?? avail.preferred_categories ?? [],
      coverage_radius_km: b.coverage_radius_km ?? avail.coverage_radius_km ?? 10,
    },
  };
  if (b.full_name) data.fullName = b.full_name;
  if (b.phone !== undefined) data.phone = b.phone;
  if (b.city !== undefined) data.city = b.city;
  if (b.bio !== undefined) data.bio = b.bio;
  if (b.bank_account !== undefined) data.bankAccount = b.bank_account;
  await prisma.user.update({ where: { id: req.user.id }, data });
  res.json({ ok: true });
}));

export default router;
