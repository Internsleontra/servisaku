// Partner matching / dispatch eligibility.
// A partner is eligible for a service when: their account is admin-verified
// (User.partnerVerified) AND they hold an active, admin-verified specialization
// (PartnerSpecialization) for that service. Optional city filter narrows by area.
import { prisma } from '../db.js';
import { resolveService } from './catalog.js';
import { ApiError } from './access.js';
import { frozenPartnerIds, isPartnerFrozen } from './wallet/index.js';

export async function findEligiblePartners(serviceIdOrSlug, { city } = {}) {
  const service = await resolveService(serviceIdOrSlug);
  if (!service) throw new ApiError(404, `Service not found: ${serviceIdOrSlug}`);

  const specs = await prisma.partnerSpecialization.findMany({
    where: {
      serviceId: service.id,
      verifiedByAdmin: true,
      isActive: true,
      partner: { role: 'partner', partnerVerified: true, ...(city ? { city } : {}) },
    },
    include: { partner: true },
    orderBy: { partner: { partnerRating: 'desc' } },
  });

  // A partner whose cash commission is badly overdue is frozen out of new
  // dispatch until they settle. Jobs they have already accepted are unaffected —
  // freezing someone mid-job would strand the customer.
  const frozen = await frozenPartnerIds(specs.map((s) => s.partnerId));

  const partners = specs
    .filter((s) => !frozen.has(s.partnerId))
    .map((s) => ({ ...s.partner, yearsExperience: s.yearsExperience }));
  return { service, partners };
}

// Used at booking time to reject assigning a partner who isn't vetted for the
// service, or who is frozen for overdue commission.
export async function isPartnerEligible(partnerId, serviceId) {
  const spec = await prisma.partnerSpecialization.findUnique({
    where: { partnerId_serviceId: { partnerId, serviceId } },
  });
  if (!(spec && spec.verifiedByAdmin && spec.isActive)) return false;
  return !(await isPartnerFrozen(partnerId));
}
