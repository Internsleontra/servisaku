# ServisAku Platform Blueprint

**Goal:** Evolve the existing ServisAku codebase (React + Vite + Express + Prisma) into a
production-ready, multi-category home-services marketplace comparable to Urban Company —
**without a greenfield rebuild**. Maximize reuse of the current architecture; everything
here is an incremental path from the code as it exists today.

**Created:** 2026-06-11 · **Status:** Living document — update as phases ship.

## Documents

| Doc | What it covers |
|-----|----------------|
| [01-current-state.md](01-current-state.md) | Honest inventory of what exists today: stack, data model, the dual catalog problem, what's real vs. simulated |
| [02-gap-analysis.md](02-gap-analysis.md) | Feature-by-feature comparison against Urban Company, severity-rated, including the P0 security gap |
| [03-target-architecture.md](03-target-architecture.md) | Target system design built on the existing stack: DB-driven catalog, Prisma schema evolution, PostgreSQL migration path, real-time, payments, mobile readiness |
| [04-service-abstraction.md](04-service-abstraction.md) | The config-driven service system: how a new category is added with zero code changes |
| [05-roadmap.md](05-roadmap.md) | Phased implementation plan (0–5), prioritized by business impact × dev effort, with acceptance criteria per phase |
| [06-phase0-security-report.md](06-phase0-security-report.md) | **Phase 0 (done 2026-06-11):** 14 vulnerabilities found & fixed, 6 functional defects fixed, deferred items; verified by `scripts/phase0-smoke.mjs` (39 assertions) |
| [07-postgres-migration.md](07-postgres-migration.md) | PostgreSQL migration runbook (reset-and-reseed) — target schema prepared at `prisma/postgres/schema.prisma`, includes the Phase 1 catalog tables |
| [08-booking-engine.md](08-booking-engine.md) | Dynamic, configuration-driven booking engine — DB-driven Step-A questions, `computePrice()`, price snapshots |
| [09-partner-app.md](09-partner-app.md) | Commercial-grade upgrade of the **web** Partner app (`src/apps/partner/`), 12-phase roadmap |
| [10-remaining-features.md](10-remaining-features.md) | **Specification for the 10 remaining feature areas** — payments (online + cash commission), payouts, refunds/disputes, damage claims, AI chatbot, notifications, email templates, support, legal/T&C, Malaysian SST. Per-feature: business logic, Prisma delta, API changes, backend/frontend/admin work, notifications, validation, security, edge cases, tests |

## Executive summary

ServisAku today is further along than a prototype: 33 lazy-loaded pages spanning consumer,
partner, and admin surfaces; a working Express + Prisma backend with JWT auth, escrow
ledger, refunds, payouts, chat, and notifications; a zod-validated service catalog for 3
categories; bilingual EN/BM; and a design-token system.

The distance to "Urban Company comparable" is **not** a rewrite — it is six workstreams:

1. **Harden** what exists (P0: unauthenticated entity routes; server-side validation; API versioning).
2. **Migrate SQLite → PostgreSQL early** (small schema now = cheap migration; unlocks the `Json` column type the whole service-abstraction design depends on — Prisma does not support `Json` on SQLite).
3. **Move the catalog from hardcoded JS into the database** and unify the two parallel catalog systems (`src/lib/catalog/` and `src/lib/packageData.js`).
4. **Build the marketplace mechanics** that don't exist yet: partner verification/KYC, availability, dispatch with expiring job offers, a real payment gateway, real-time transport.
5. **Expand categories through configuration** — 6 today → ~16 (cleaning, AC, appliance repair, plumbing, electrical, painting, pest, carpentry, handyman, smart home, water purifier, women's salon, men's grooming, spa & massage, and more).
6. **Layer growth features**: subscriptions, memberships, loyalty, referrals, dynamic pricing, QA photo verification, dispute workflows.

The stack decision is to **keep React + Express + Prisma** and prepare for React Native
mobile apps by making the REST API versioned, documented (OpenAPI), and token-refresh
capable — the API serves web and mobile alike.
