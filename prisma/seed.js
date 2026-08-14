import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import bcrypt from 'bcryptjs';
import { seedCatalog } from './catalogSeed.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // --- Catalog (DB-driven service abstraction) ---
  await seedCatalog(prisma);

  // --- Users ---
  const adminPw = await bcrypt.hash('admin123', 10);
  const partnerPw = await bcrypt.hash('partner123', 10);
  const userPw = await bcrypt.hash('user123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@servisaku.my' },
    update: {},
    create: { email: 'admin@servisaku.my', passwordHash: adminPw, fullName: 'Admin User', role: 'admin' },
  });

  const partner1 = await prisma.user.upsert({
    where: { email: 'ali@servisaku.my' },
    update: {},
    create: { email: 'ali@servisaku.my', passwordHash: partnerPw, fullName: 'Ali Ahmad', role: 'partner', partnerVerified: true, partnerRating: 4.9, city: 'Kuala Lumpur', bio: 'Expert home cleaner with 5 years experience.' },
  });

  const partner2 = await prisma.user.upsert({
    where: { email: 'raj@servisaku.my' },
    update: {},
    create: { email: 'raj@servisaku.my', passwordHash: partnerPw, fullName: 'Raj Kumar', role: 'partner', partnerVerified: true, partnerRating: 4.7, city: 'Petaling Jaya', bio: 'AC servicing and deep cleaning specialist.' },
  });

  const partner3 = await prisma.user.upsert({
    where: { email: 'chong@servisaku.my' },
    update: {},
    create: { email: 'chong@servisaku.my', passwordHash: partnerPw, fullName: 'David Chong', role: 'partner', partnerVerified: true, partnerRating: 5.0, city: 'Subang Jaya', bio: 'Professional pest control and exterminator.' },
  });

  const partner4 = await prisma.user.upsert({
    where: { email: 'siti@servisaku.my' },
    update: {},
    create: { email: 'siti@servisaku.my', passwordHash: partnerPw, fullName: 'Siti Nurhaliza', role: 'partner', partnerVerified: true, partnerRating: 4.8, city: 'Kuala Lumpur', bio: 'Plumbing and home repair expert.' },
  });

  const consumer = await prisma.user.upsert({
    where: { email: 'user@servisaku.my' },
    update: {},
    create: { email: 'user@servisaku.my', passwordHash: userPw, fullName: 'Demo User', role: 'consumer', city: 'Kuala Lumpur' },
  });

  // --- Partner specializations (matching engine) ---
  // Maps the demo partners to the services they're admin-verified to perform.
  const specMap = [
    { partner: partner1, slug: 'cleaning', years: 5 },   // Ali — cleaning
    { partner: partner2, slug: 'cleaning', years: 3 },   // Raj — cleaning
    { partner: partner4, slug: 'plumbing', years: 6 },   // Siti — plumbing
    { partner: partner3, slug: 'electrical', years: 4 }, // David — electrical
  ];
  for (const { partner, slug, years } of specMap) {
    const service = await prisma.service.findUnique({ where: { slug } });
    if (!service) continue;
    await prisma.partnerSpecialization.upsert({
      where: { partnerId_serviceId: { partnerId: partner.id, serviceId: service.id } },
      update: { verifiedByAdmin: true, isActive: true, yearsExperience: years },
      create: { partnerId: partner.id, serviceId: service.id, verifiedByAdmin: true, isActive: true, yearsExperience: years },
    });
  }

  // --- Coupons ---
  await prisma.coupon.upsert({
    where: { code: 'WELCOME20' },
    update: {},
    create: { code: 'WELCOME20', discountType: 'percentage', discountValue: 20, maxDiscountCap: 50, minOrderAmount: 100, isActive: true },
  });

  await prisma.coupon.upsert({
    where: { code: 'RM50OFF' },
    update: {},
    create: { code: 'RM50OFF', discountType: 'fixed', discountValue: 50, minOrderAmount: 200, isActive: true },
  });

  // --- Bookings ---
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 3);

  const bk1 = await prisma.booking.upsert({
    where: { id: 'bk-seed-1' },
    update: {},
    create: { id: 'bk-seed-1', serviceType: 'House Cleaning', status: 'completed', price: 120, date: pastDate, consumerId: consumer.id, partnerId: partner1.id, address: '12 Jalan Bukit, KL', city: 'Kuala Lumpur' },
  });

  const bk2 = await prisma.booking.upsert({
    where: { id: 'bk-seed-2' },
    update: {},
    create: { id: 'bk-seed-2', serviceType: 'AC Servicing', status: 'completed', price: 150, date: pastDate, consumerId: consumer.id, partnerId: partner2.id, address: '45 Taman Jaya, PJ', city: 'Petaling Jaya' },
  });

  const bk3 = await prisma.booking.upsert({
    where: { id: 'bk-seed-3' },
    update: {},
    create: { id: 'bk-seed-3', serviceType: 'Plumbing Repair', status: 'pending', price: 200, date: new Date(), consumerId: consumer.id, address: '8 Sri Hartamas, KL', city: 'Kuala Lumpur' },
  });

  // --- Escrow ---
  await prisma.escrowLedger.upsert({
    where: { bookingId: 'bk-seed-1' },
    update: {},
    create: { bookingId: 'bk-seed-1', grossAmount: 120, commissionAmount: 24, commissionRate: 0.2, partnerPayout: 96, status: 'released' },
  });

  await prisma.escrowLedger.upsert({
    where: { bookingId: 'bk-seed-3' },
    update: {},
    create: { bookingId: 'bk-seed-3', grossAmount: 200, commissionAmount: 40, commissionRate: 0.2, partnerPayout: 160, status: 'held' },
  });

  // --- Reviews ---
  await prisma.review.upsert({
    where: { bookingId: 'bk-seed-1' },
    update: {},
    create: { bookingId: 'bk-seed-1', userId: consumer.id, rating: 5, comment: 'Ali was fantastic! Very professional and thorough.' },
  });

  // --- Payout ---
  await prisma.payoutRecord.create({
    data: { partnerId: partner1.id, partnerName: partner1.fullName, amountRequested: 96, amountPaid: 96, status: 'completed', payoutMethod: 'Bank Transfer' },
  }).catch(() => {}); // ignore if already exists

  console.log('✅ Database seeded successfully!');
  console.log('\n🔐 Demo Credentials:');
  console.log('   Admin:   admin@servisaku.my / admin123');
  console.log('   Partner: ali@servisaku.my   / partner123');
  console.log('   User:    user@servisaku.my  / user123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
