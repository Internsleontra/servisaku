// Catalog data-access + output mapping for the DB-driven service abstraction.
// The catalog API, the pricing engine, and booking validation all go through here
// so there is one definition of how catalog rows map to the snake_case API contract.
import { prisma } from '../db.js';
import { ApiError } from './access.js';

// Resolve a service by slug ("cleaning") or cuid id, with its category + packages +
// active add-ons. Returns null if not found / inactive.
export async function resolveService(idOrSlug) {
  if (!idOrSlug) return null;
  return prisma.service.findFirst({
    where: { isActive: true, OR: [{ slug: String(idOrSlug) }, { id: String(idOrSlug) }] },
    include: {
      category: true,
      packages: { orderBy: { sortOrder: 'asc' } },
      addons: { where: { isActive: true } },
    },
  });
}

export async function resolveServiceOr404(idOrSlug) {
  const service = await resolveService(idOrSlug);
  if (!service) throw new ApiError(404, `Service not found: ${idOrSlug}`);
  return service;
}

// Full detail loader for the booking wizard: legacy packages/addons PLUS the
// dynamic Step-A questions/options (ordered). Used by GET /services/:id.
export async function resolveServiceDetail(idOrSlug) {
  if (!idOrSlug) return null;
  return prisma.service.findFirst({
    where: { isActive: true, OR: [{ slug: String(idOrSlug) }, { id: String(idOrSlug) }] },
    include: {
      category: true,
      packages: { orderBy: { sortOrder: 'asc' } },
      addons: { where: { isActive: true } },
      questions: { orderBy: { sortOrder: 'asc' }, include: { options: { orderBy: { sortOrder: 'asc' } } } },
    },
  });
}

export async function resolveServiceDetailOr404(idOrSlug) {
  const service = await resolveServiceDetail(idOrSlug);
  if (!service) throw new ApiError(404, `Service not found: ${idOrSlug}`);
  return service;
}

// ── Categories ───────────────────────────────────────────────────────────────
export async function listCategories() {
  return prisma.serviceCategory.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { services: { where: { isActive: true }, select: { id: true } } },
  });
}

export async function getCategoryServicesOr404(slug) {
  const category = await prisma.serviceCategory.findFirst({ where: { slug: String(slug), isActive: true } });
  if (!category) throw new ApiError(404, `Category not found: ${slug}`);
  const services = await prisma.service.findMany({
    where: { categoryId: category.id, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { category: true },
  });
  return { category, services };
}

export function mapCategory(c) {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    name_my: c.nameMy,
    tagline: c.tagline ?? null,
    icon_key: c.iconKey,
    accent: c.accent,
    hero_image: c.heroImage ?? null,
    header_image: c.headerImage ?? null,
    price_from: c.priceFrom,
    sort_order: c.sortOrder,
    emergency_supported: !!c.emergencySupported,
    recurring_supported: !!c.recurringSupported,
    service_count: Array.isArray(c.services) ? c.services.length : undefined,
  };
}

// ── Step-A questions (dynamic booking engine) ────────────────────────────────
export function mapQuestion(q) {
  return {
    id: q.key, // stable answer key
    label: q.label,
    type: q.type,
    required: q.required,
    sort_order: q.sortOrder,
    config: q.config ?? null,
    options: (q.options || []).map((o) => ({
      id: o.key,
      label: o.label,
      price_modifier: o.priceModifier,
      unit_price: o.unitPrice,
      price_modifier_per_sqft: o.priceModifierPerSqft,
      is_default: o.isDefault,
      sort_order: o.sortOrder,
    })),
  };
}

// Convert a DB service (with questions/options) into the shape computePrice()
// expects (DB `key` → engine `id`). One conversion point keeps the engine pure.
export function toEngineService(s) {
  return {
    slug: s.slug,
    name: s.name,
    nameMy: s.nameMy,
    pricingType: s.pricingType,
    basePrice: s.basePrice,
    visitFee: s.visitFee,
    minQty: s.minQty,
    rate: s.rate,
    unitPrice: s.unitPrice,
    sstEnabled: s.sstEnabled,
    questions: (s.questions || []).map((q) => ({
      id: q.key,
      label: q.label,
      labelMy: q.labelMy || '',
      type: q.type,
      required: q.required,
      config: q.config ?? null,
      options: (q.options || []).map((o) => ({
        id: o.key,
        label: o.label,
        labelMy: o.labelMy || '',
        priceModifier: o.priceModifier,
        unitPrice: o.unitPrice,
        priceModifierPerSqft: o.priceModifierPerSqft,
        isDefault: o.isDefault,
      })),
    })),
  };
}

export async function listServices() {
  return prisma.service.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      category: true,
      packages: { orderBy: { sortOrder: 'asc' } },
      addons: { where: { isActive: true } },
    },
  });
}

// Derive a service-level agreement summary from the category workflow config.
export function buildSla(category) {
  const wf = category?.workflowConfig || {};
  const scheduleStep = Array.isArray(wf.bookingSteps)
    ? wf.bookingSteps.find((s) => s.type === 'schedule')
    : null;
  return {
    arrival_window_min: wf.arrivalWindowMin ?? null,
    warranty_days: wf.warrantyDays ?? null,
    lead_time_hours: scheduleStep?.leadTimeHours ?? null,
    slot_granularity_min: scheduleStep?.slotGranularityMin ?? 60,
    emergency_available: !!category?.emergencySupported,
    recurring_available: !!category?.recurringSupported,
    cancellation_policy: wf.cancellationPolicy ?? null,
    quote_flow: !!wf.quoteFlow,
  };
}

export function mapServiceSummary(s) {
  return {
    id: s.id,
    slug: s.slug,
    category_id: s.categoryId,
    category_slug: s.category?.slug ?? null,
    name: s.name,
    name_my: s.nameMy,
    description: s.description,
    description_my: s.descriptionMy,
    icon_key: s.category?.iconKey ?? null,
    accent: s.category?.accent ?? null,
    base_price: s.basePrice,
    price_from: s.category?.priceFrom ?? s.basePrice,
    pricing_model: s.pricingModel,
    pricing_type: s.pricingType ?? null,
    visit_fee: s.visitFee ?? 0,
    converts_to_quote: !!s.convertsToQuote,
    duration_min: s.durationMin,
    duration_max: s.durationMax,
    emergency_supported: !!s.category?.emergencySupported,
    recurring_supported: !!s.category?.recurringSupported,
    package_count: Array.isArray(s.packages) ? s.packages.length : undefined,
    is_active: s.isActive,
  };
}

export function mapPackage(p) {
  return {
    id: p.id,
    tier: p.tier,
    name: p.name,
    name_my: p.nameMy,
    description: p.description,
    description_my: p.descriptionMy,
    price: p.price,
    multiplier: p.multiplier,
    inclusions: Array.isArray(p.inclusions) ? p.inclusions : [],
    inclusions_my: Array.isArray(p.inclusionsMy) ? p.inclusionsMy : [],
    is_popular: p.isPopular,
    sort_order: p.sortOrder,
  };
}

export function mapAddon(a) {
  return {
    id: a.id,
    slug: a.slug,
    name: a.name,
    name_my: a.nameMy,
    price: a.price,
    duration_min: a.durationMin,
  };
}

export function mapServiceDetail(s) {
  return {
    ...mapServiceSummary(s),
    pricing_config: s.pricingConfig ?? null,
    workflow_config: s.category?.workflowConfig ?? null,
    sla: buildSla(s.category),
    min_qty: s.minQty ?? 1,
    sst_enabled: !!s.sstEnabled,
    packages: (s.packages || []).map(mapPackage),
    addons: (s.addons || []).map(mapAddon),
    // Dynamic Step-A — empty for legacy package services, populated for engine services.
    questions: (s.questions || []).map(mapQuestion),
  };
}

// Validate service-specific answers against the category workflowConfig.
// Enforces required params and (for select widgets) option membership.
// Throws ApiError(400) listing every problem found. Returns the cleaned params.
export function validateServiceParams(workflowConfig, params = {}) {
  const wf = workflowConfig || {};
  const required = Array.isArray(wf.requiredParams) ? wf.requiredParams : [];
  const fields = collectParamFields(wf);
  const errors = [];

  for (const id of required) {
    const v = params[id];
    if (v === undefined || v === null || v === '') errors.push(`${id} is required`);
  }

  for (const f of fields) {
    const v = params[f.id];
    if (v === undefined || v === null || v === '') continue; // presence handled above
    if (f.widget === 'select' && Array.isArray(f.options) && !f.options.includes(v)) {
      errors.push(`${f.id} must be one of: ${f.options.join(', ')}`);
    }
    if (f.widget === 'textarea' && f.maxLength && String(v).length > f.maxLength) {
      errors.push(`${f.id} exceeds ${f.maxLength} characters`);
    }
  }

  if (errors.length) throw new ApiError(400, `Invalid service details: ${errors.join('; ')}`);
  return params;
}

function collectParamFields(workflowConfig) {
  const steps = Array.isArray(workflowConfig?.bookingSteps) ? workflowConfig.bookingSteps : [];
  return steps
    .filter((s) => s.type === 'params' && Array.isArray(s.fields))
    .flatMap((s) => s.fields);
}
