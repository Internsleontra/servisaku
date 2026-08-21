// ════════════════════════════════════════════════════════════════════════════
// Dynamic booking-engine seed.
//
// Imports prisma/data/servisaku-services-config.json (the master config) and
// upserts the full catalogue into the DB-driven tables:
//   12 categories → 71 services → all Step-A questions → all options.
//
// Idempotent: categories/services upsert by slug; a service's questions are
// replaced wholesale (delete-cascade → recreate) so re-running always converges
// the DB to the config. Run:  npm run db:seed:booking-engine
//
// This is the CANONICAL catalog source. `prisma/seed.js` imports
// `seedBookingEngine()` so the ordinary seed produces the same catalogue the
// application actually reads — the client is passed in rather than created here,
// so importing this module has no side effects.
// ════════════════════════════════════════════════════════════════════════════
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(__dirname, 'data/servisaku-services-config.json'), 'utf8'));

// Per-category presentation hints (config has none); safe defaults otherwise.
const CATEGORY_META = {
  'beauty-wellness-women': { iconKey: 'Sparkles', accent: 'pink' },
  'mens-grooming-massage': { iconKey: 'Scissors', accent: 'slate' },
  'cleaning': { iconKey: 'Sparkles', accent: 'emerald' },
  'pest-control': { iconKey: 'Bug', accent: 'lime' },
  'ac-services': { iconKey: 'Wind', accent: 'sky' },
  'appliance-repair': { iconKey: 'Wrench', accent: 'orange' },
  'electrician': { iconKey: 'Zap', accent: 'amber' },
  'plumbing': { iconKey: 'Droplet', accent: 'blue' },
  'carpenter': { iconKey: 'Hammer', accent: 'stone' },
  'painting-renovation': { iconKey: 'PaintRoller', accent: 'violet' },
  'handyman-installation': { iconKey: 'Drill', accent: 'teal' },
  'instant-help': { iconKey: 'Clock', accent: 'red' },
};

// Map the new pricingType onto the legacy pricingModel enum so older catalog UI
// keeps working; the dynamic engine ignores pricingModel.
const PRICING_MODEL = {
  FIXED: 'flat', TIERED: 'flat', BASE_PLUS_ADDONS: 'flat',
  PER_UNIT: 'per_unit', TIER_QUANTITY: 'per_unit',
  PER_SQFT: 'area_based', PER_HOUR: 'hourly', DIAGNOSTIC: 'quote',
};

// Cheapest realistic starting price for a service → ServiceCategory.priceFrom
// ("from RMxx" on the catalogue cards). Keyed off the dominant pricing driver.
function serviceFromPrice(s) {
  const qs = s.questions || [];
  const optMin = (type, field) => {
    const q = qs.find((q) => q.type === type);
    if (!q) return null;
    const pos = (q.options || []).map((o) => o[field] || 0).filter((v) => v > 0);
    return pos.length ? Math.min(...pos) : null;
  };
  const cfgOf = (type, key) => qs.find((q) => q.type === type)?.config?.[key];

  switch (s.pricingType) {
    case 'TIERED':
      return optMin('TIER_SELECT', 'priceModifier') ?? optMin('SINGLE_SELECT', 'priceModifier') ?? s.visitFee ?? 0;
    case 'FIXED':
    case 'BASE_PLUS_ADDONS':
      return s.basePrice || optMin('TIER_SELECT', 'priceModifier') || optMin('SINGLE_SELECT', 'priceModifier') || s.visitFee || 0;
    case 'TIER_QUANTITY':
      return optMin('TIER_QUANTITY', 'unitPrice') ?? s.visitFee ?? 0;
    case 'PER_UNIT':
      return cfgOf('QUANTITY', 'pricePerUnit') || optMin('TIER_QUANTITY', 'unitPrice') || s.unitPrice || s.visitFee || 0;
    case 'PER_SQFT':
      return cfgOf('AREA_INPUT', 'ratePerSqft') || s.rate || 0;
    case 'PER_HOUR':
      return cfgOf('HOURS_INPUT', 'ratePerHour') || s.rate || 0;
    case 'DIAGNOSTIC':
      return s.visitFee || 0;
    default:
      return s.visitFee || 0;
  }
}

async function seedService(prisma, categoryId, svc, sortOrder) {
  const data = {
    categoryId,
    name: svc.name,
    // Malay comes from the config. Falling back to the English name would
    // re-introduce the bug this replaced: a populated *_my column that is not
    // actually a translation, which tField() then correctly refuses to use.
    nameMy: svc.nameMy || svc.name,
    basePrice: svc.basePrice ?? 0,
    pricingModel: PRICING_MODEL[svc.pricingType] || 'flat',
    pricingType: svc.pricingType,
    unitPrice: svc.unitPrice ?? null,
    rate: svc.rate ?? null,
    visitFee: svc.visitFee ?? 0,
    minQty: svc.minQty ?? 1,
    sstEnabled: svc.sstEnabled ?? false,
    convertsToQuote: svc.convertsToQuote ?? false,
    isActive: true,
    sortOrder,
  };

  const service = await prisma.service.upsert({
    where: { slug: svc.slug },
    create: { slug: svc.slug, ...data },
    update: data,
  });

  // Replace questions wholesale (cascade clears options) → converges to config.
  await prisma.bookingQuestion.deleteMany({ where: { serviceId: service.id } });
  let qOrder = 0;
  for (const q of svc.questions || []) {
    await prisma.bookingQuestion.create({
      data: {
        serviceId: service.id,
        key: q.id,
        label: q.label,
        type: q.type,
        required: q.required ?? true,
        sortOrder: qOrder++,
        config: q.config ?? null,
        options: {
          create: (q.options || []).map((o, i) => ({
            key: o.id,
            label: o.label,
            priceModifier: o.priceModifier ?? 0,
            unitPrice: o.unitPrice ?? null,
            priceModifierPerSqft: o.priceModifierPerSqft ?? null,
            isDefault: o.isDefault ?? false,
            sortOrder: i,
          })),
        },
      },
    });
  }
  return service;
}

export async function seedBookingEngine(prisma) {
  console.log(`Seeding dynamic booking engine (config v${config.version})…`);
  let catCount = 0, svcCount = 0, qCount = 0, optCount = 0;

  for (const [catIdx, cat] of config.categories.entries()) {
    const meta = CATEGORY_META[cat.slug] || {};
    const priceFrom = Math.min(...cat.services.map(serviceFromPrice));
    const catData = {
      name: cat.name,
      nameMy: cat.nameMy || cat.name,
      iconKey: meta.iconKey || 'Home',
      accent: meta.accent || 'emerald',
      sortOrder: catIdx,
      isActive: true,
      priceFrom: Number.isFinite(priceFrom) ? priceFrom : 0,
    };
    const category = await prisma.serviceCategory.upsert({
      where: { slug: cat.slug },
      create: { slug: cat.slug, ...catData },
      update: catData,
    });
    catCount++;

    for (const [svcIdx, svc] of cat.services.entries()) {
      await seedService(prisma, category.id, svc, svcIdx);
      svcCount++;
      qCount += (svc.questions || []).length;
      optCount += (svc.questions || []).reduce((s, q) => s + (q.options || []).length, 0);
    }
    console.log(`  ✓ ${cat.name} (${cat.services.length} services)`);
  }

  console.log(`\nDone: ${catCount} categories, ${svcCount} services, ${qCount} questions, ${optCount} options.`);
}

// Run standalone (`npm run db:seed:booking-engine`) — but stay inert on import,
// so prisma/seed.js can reuse seedBookingEngine() with its own client.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const prisma = new PrismaClient();
  seedBookingEngine(prisma)
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
}
