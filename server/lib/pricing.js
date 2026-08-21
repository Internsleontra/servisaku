// Server-authoritative pricing — Phase 1, DB-driven.
// Reads ServicePackage + ServiceAddon + pricingConfig from the catalog tables
// (seeded from the legacy JS catalog), so the catalog is the single source of
// truth.
import { ApiError } from './access.js';
import { localizedError } from './errors.js';
import { resolveService } from './catalog.js';

// Package-pricing arithmetic. Self-contained here so the server has no
// dependency on the web bundle (the legacy browser engine that previously
// exported this was removed when the dynamic engine became canonical).
function calculatePrice(basePrice, pkgMultiplier, addons, coupon, surge = 1, sizeMultiplier = 1) {
  const pkgPrice = Math.round(basePrice * pkgMultiplier * sizeMultiplier);
  const addonTotal = addons.reduce((s, a) => s + a.price, 0);
  const subtotal = Math.round((pkgPrice + addonTotal) * surge);
  let discount = 0;
  if (coupon) {
    discount = coupon.discount_type === 'percentage'
      ? Math.min(Math.round(subtotal * coupon.discount_value / 100), coupon.max_discount_cap || 999)
      : coupon.discount_value;
  }
  const platformFee = Math.round(subtotal * 0.2);
  const partnerPayout = subtotal - platformFee;
  return { subtotal, discount, total: subtotal - discount, platformFee, partnerPayout, sizedBasePrice: pkgPrice };
}

// area_based services carry pricingConfig.tiers = [{ id, label, multiplier }].
function sizeMultiplierFor(service, sizeId, locale) {
  const tiers = service.pricingConfig?.tiers;
  if (!Array.isArray(tiers) || tiers.length === 0) return 1.0;
  if (!sizeId) return 1.0; // no size chosen → base (2BR-equivalent) price
  const tier = tiers.find((t) => t.id === sizeId);
  if (!tier) throw localizedError(400, 'unknown_property_size', locale, sizeId, service.slug);
  return tier.multiplier ?? 1.0;
}

async function resolveCoupon(prisma, couponCode, subtotal, serviceKey, locale) {
  const coupon = await prisma.coupon.findUnique({ where: { code: couponCode } });
  if (!coupon || !coupon.isActive) throw localizedError(400, 'coupon_invalid', locale);
  if (coupon.validUntil && coupon.validUntil < new Date()) throw localizedError(400, 'coupon_expired', locale);
  if (coupon.maxUsage != null && coupon.usageCount >= coupon.maxUsage) throw localizedError(400, 'coupon_usage_limit', locale);
  if (coupon.minOrderAmount != null && subtotal < coupon.minOrderAmount) {
    throw localizedError(400, 'coupon_min_order', locale, coupon.minOrderAmount);
  }
  if (Array.isArray(coupon.applicableServices) && coupon.applicableServices.length) {
    const allowed = coupon.applicableServices.map((s) => String(s).trim());
    if (!allowed.includes(serviceKey)) throw localizedError(400, 'coupon_wrong_service', locale);
  }
  return coupon;
}

// Absolute package price wins; otherwise multiplier × service.basePrice (catalog style).
function packageBasePrice(service, pkg) {
  if (pkg.price != null) return pkg.price;
  return Math.round(service.basePrice * (pkg.multiplier ?? 1));
}

function buildLineItems(pkg, addons, pricing, coupon, discount) {
  const items = [
    { kind: 'package', refId: pkg.id, label: pkg.name, labelMy: pkg.nameMy, qty: 1, unitPrice: pricing.sizedBasePrice, total: pricing.sizedBasePrice },
    ...addons.map((a) => ({ kind: 'addon', refId: a.id, label: a.name, labelMy: a.nameMy, qty: 1, unitPrice: a.price, total: a.price })),
  ];
  if (coupon && discount > 0) {
    items.push({ kind: 'discount', refId: coupon.id, label: `Coupon ${coupon.code}`, labelMy: `Kupon ${coupon.code}`, qty: 1, unitPrice: -discount, total: -discount });
  }
  return items;
}

/**
 * Compute the authoritative price for a booking / quote.
 * @param {object} prisma
 * @param {object} args
 * @param {string} args.serviceId   service slug or id ("cleaning")
 * @param {string} args.packageId   package tier or id ("deep")
 * @param {string[]} [args.addonIds] addon slugs or ids
 * @param {string} [args.bedrooms]  legacy area-tier id (mapped to propertySize)
 * @param {object} [args.serviceSpecificData] workflow param answers
 * @param {string} [args.couponCode]
 * @returns full pricing breakdown + resolved catalog ids + line items
 */
export async function priceBooking(prisma, { serviceId, packageId, addonIds = [], bedrooms, serviceSpecificData, couponCode, locale }) {
  const service = await resolveService(serviceId);
  if (!service) throw localizedError(400, 'unknown_service', locale, serviceId);
  const serviceKey = service.slug;

  const pkg = service.packages.find((p) => p.tier === packageId || p.id === packageId);
  if (!pkg) throw localizedError(400, 'unknown_package', locale, packageId, serviceKey);

  const addons = addonIds.map((id) => {
    const addon = service.addons.find((a) => a.slug === id || a.id === id);
    if (!addon) throw localizedError(400, 'unknown_addon', locale, id, serviceKey);
    return addon;
  });

  const sizeId = bedrooms || serviceSpecificData?.propertySize || serviceSpecificData?.bedrooms || null;
  const sizeMultiplier = service.pricingModel === 'area_based' ? sizeMultiplierFor(service, sizeId, locale) : 1.0;
  const basePrice = packageBasePrice(service, pkg);

  // Pass 1 (no coupon) yields the subtotal coupon rules are validated against.
  const base = calculatePrice(basePrice, 1.0, addons, null, 1, sizeMultiplier);

  let coupon = null;
  if (couponCode) {
    coupon = await resolveCoupon(prisma, couponCode, base.subtotal, serviceKey, locale);
  }

  const pricing = calculatePrice(
    basePrice, 1.0, addons,
    coupon && {
      discount_type: coupon.discountType,
      discount_value: coupon.discountValue,
      max_discount_cap: coupon.maxDiscountCap,
    },
    1, sizeMultiplier,
  );

  return {
    ...pricing,
    serviceKey,
    serviceId: service.id,
    serviceSlug: service.slug,
    categoryId: service.categoryId,
    pricingModel: service.pricingModel,
    sizeId: service.pricingModel === 'area_based' ? sizeId : null,
    sizeMultiplier,
    packageId: pkg.id,
    packageTier: pkg.tier,
    packageName: pkg.name,
    packageNameMy: pkg.nameMy,
    addons,
    lineItems: buildLineItems(pkg, addons, pricing, coupon, pricing.discount),
    couponId: coupon?.id ?? null,
    couponCode: coupon?.code ?? null,
  };
}
