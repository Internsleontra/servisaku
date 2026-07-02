# ServisAku Partner App — Upgrade

Production upgrade of the **web** Partner app (`src/apps/partner/`, React + Vite + Tailwind),
not a React Native rebuild. The Partner app is one of two builds off the shared codebase
(see the consumer/partner split in `src/apps/`). Native packaging is planned via Capacitor,
consistent with `servisaku-app/`.

## Design system

Reuses the existing token layer in `src/styles/tokens.css` + `tailwind.config.js`:

| Token | Value | Usage |
|-------|-------|-------|
| `--brand` | `24 95% 53%` (#f97316 orange) | primary actions, accents |
| `--brand-tint` / `--brand-ink` | tint / deep orange | chips, gradients |
| `surface` / `raised` / `bg` | white / subtle / page | cards, fills |
| `hairline` | low-contrast border | card borders (`border-hairline/10`) |
| radii | `rounded-2xl` (16px) | cards, tiles, sheets |
| elevation | `shadow-e1` / `shadow-e2` | resting / hover |
| icons | **Lucide** | everywhere |

## Reusable partner primitives — `src/components/partner/`

Building blocks shared by every partner screen (dashboard, wallet, analytics, …):

- **`MetricCard`** — KPI tile (icon chip + value + label + sub). `tone` (brand/amber/emerald/sky/violet/rose/slate); optional `to` (Link) or `onClick` to make it tappable.
- **`QuickActions`** — responsive grid of icon shortcuts (`{ icon, label, to?, onClick?, badge? }`).
- **`SectionHeader`** — title + optional sub + trailing action.

> Convention: new partner UI that is reused 2+ times goes here. Screen-specific composition stays in the page.

## Phase 1 — Dashboard (done)

`src/pages/PartnerDashboard.jsx` rebuilt on the primitives. Reuses the existing
job-loading (`Booking.filter` for assigned + open pool) and lifecycle handlers
(`claim`/`update`) unchanged.

Added: today/week/month earnings + pending payout in the header card; persisted
online/offline (localStorage `partner_online`); quick actions (Schedule, Wallet,
Alerts, Profile); wallet snapshot; a **Performance** panel computed from booking data
(rating, completion %, cancellation %, repeat clients); job cards now open the job screen.

## Phase 2 — Booking Detail + dynamic service workflow (done)

`src/pages/PartnerJobScreen.jsx` rebuilt in the partner design system (was using the
old green `primary` theme). Preserves all existing behaviour — realtime booking hook,
GPS tracking, status lifecycle, completion-photo gating, delay/cannot-access alerts,
navigate/call/chat.

Added the core requirement: the partner sees **every customer answer**.
- `src/lib/bookingAnswers.js` — `summarizeAnswers(questions, answers)` maps stored
  answers → human-readable `{label, value}` rows for all 8 widget types
  (TIER_SELECT, SINGLE_SELECT, MULTI_SELECT, QUANTITY, TIER_QUANTITY, AREA_INPUT,
  HOURS_INPUT, INFO). `answersFromBreakdown()` is the legacy fallback.
- Loads the service's question config via `catalog.getService(catalog_service_id)`
  (the resolver matches id-or-slug, so no schema change needed).
- New reusable presentational components: `AnswerList`, `InvoiceBreakdown`.
- Booking Detail now shows: customer + address + notes, navigate, **service details
  (all answers)**, customer-uploaded photos, **invoice** (price_breakdown + total +
  payout + payment method), completion photos, lifecycle action.

## Phase 3a — Service execution: photo verification + timeline (done)

Backend (`server/routes/bookings.js`):
- **Lifecycle timestamps** — every status PATCH now appends `{ status, at, by }` to
  `booking.lifecycle` (server-authoritative). Previously the partner's
  `partner_started_at`/`partner_completed_at` were silently dropped by the PATCH whitelist.
- **`POST /bookings/:id/photos`** — partner-only; body `{ phase: 'before'|'after', photos: [{url, at?, lat?, lng?}] }`.
  Merges into `details.photos[phase]` **without clobbering** `details.answers`.
- `mapBookingOut` now exposes `photos` and `lifecycle`.
- Client: `Booking.addPhotos(id, payload)` (apiClient + mockClient parity).

Frontend (`PartnerJobScreen.jsx` + new components):
- `PhotoCapture` — before/after grid; thumbnails show capture time; camera input (`capture="environment"`).
- `ExecutionTimeline` — vertical timeline from `lifecycle` via `STATUS_META`.
- Before photos editable at `arrived`/`started`; After photos at `started` and **required to complete**.
- Photos persisted with timestamp + best-effort geotag (`getCurrentPosition`).

Verified end-to-end (API + browser): photo persists with metadata, answers preserved through
the merge, every transition stamps the timeline (En Route → Arrived → In Progress all shown),
completion blocked until an after-photo exists.

> Photo storage note: `UploadFile` is still a placeholder returning a local blob URL (object
> storage is a production blocker). The flow + persistence are done; swapping in S3 needs no UI change.

## Phase 3b — Extra services + customer approval (done)

Schema: `BookingItem` gained `status` (approved|pending|rejected, default approved so existing
items are unaffected) + `addedBy`. Migration `20260626080708_booking_item_status`.

Backend (`server/routes/bookings.js`):
- **`POST /bookings/:id/extras`** — partner-only, during the job (`arrived`/`started`). Creates a
  pending `BookingItem` (kind=addon). Does **not** change price.
- **`PATCH /bookings/:id/extras/:itemId`** — **consumer-only**; `{status: approved|rejected}`.
  On approval: `booking.price += total` and an `ADDON` line is appended to `priceBreakdown`
  (transactional). No manual price negotiation.
- `mapBookingOut` now returns `extras`; GET/PATCH/photos/extras handlers include `items`.
- Client: `Booking.addExtra` / `Booking.decideExtra` (+ mock parity).

Frontend — shared `src/components/ExtraServices.jsx` (used by both sides):
- Partner (`PartnerJobScreen`): "Add extra service" form → `addExtra` + notifies the customer.
- Consumer (`BookingDetail`): pending extras show Approve/Reject; approving updates the bill.

Verified end-to-end (curl): propose → pending (price unchanged) → partner approve blocked (403)
→ consumer approve → price RM90→RM135 + ADDON breakdown line. Build + lint clean.

## Phase 4 — Wallet (done)

Backend (`server/routes/payouts.js`):
- **`GET /payouts/wallet`** — computed summary: `lifetime` (Σ completed-booking payouts, 80%), `pending`
  (Σ active-job payouts), `withdrawn` (Σ requested/paid payout records), `withdrawable` = lifetime − withdrawn.
- **`POST /payouts/withdraw`** — partner-only; validates `amount ≤ withdrawable`; creates a pending
  `PayoutRecord`. (Existing admin `POST/PATCH /payouts` unchanged.)
- Earnings computed from completed bookings (escrow release is admin-only / not automated).
- Client: `servisaku.wallet.get()` / `.withdraw(amount)` (+ mock parity).

Frontend (`PartnerEarnings.jsx` → Wallet): available-to-withdraw header + Withdraw-to-bank bottom
sheet (25/50/Max quick-fills), MetricCard tiles (withdrawable/pending/withdrawn/bonuses), earnings
trend chart (now computed from bookings — the old chart keyed on `period_month` which the API never
returned), Transactions + Withdrawals tabs.

Verified (curl): wallet summary; withdraw RM30 → withdrawable 232→202 + pending PayoutRecord;
over-withdraw blocked (400). Build + lint clean.

> Bonuses / penalties / referral earnings are shown as `—` ("coming soon") — they need a real
> ledger/adjustments table, which doesn't exist yet.

## Phase 5 — Availability (done)

Schema: `User.availability Json?` (migration `…_partner_availability`).
Backend: new `server/routes/partners.js` mounted at `/partners`:
- **`GET /partners/me/availability`** — partner-only; returns config merged over defaults.
- **`PATCH /partners/me/availability`** — partial update, zod-validated, merged onto current.
- Client: `servisaku.availability.{get,update}` (+ mock parity).

Frontend: `PartnerAvailability.jsx` at `/partner/availability` (dashboard quick action):
vacation mode, instant-booking, working days, working hours + lunch break, max-daily-jobs &
coverage-radius sliders, preferred areas (CITIES) + categories (live), unavailable dates, sticky save.

Verified (curl): defaults; partial PATCH updates + merges (other fields preserved) + persists;
bad time → 400. Build + lint clean.

> Not yet wired: availability isn't consumed by dispatch/matching yet (vacation/radius/working-hours
> don't gate the job pool). That's a matching-engine change for a later phase.

## Phase 6 — Verification Center + Documents (Malaysia) (done)

Schema: `PartnerDocument` model (partnerId+type unique; status pending|verified|rejected|expired;
fileUrl, number, expiryDate, rejectionReason, verifiedAt) + `User.documents` relation.
Migration `…_partner_documents`.

Backend (`server/routes/partners.js`) — **Malaysia-specific** doc catalogue:
MyKad (NRIC, IC validated/normalised to `######-##-####`), Selfie, Skills certificate
(CIDB / Suruhanjaya Tenaga competency / SPAN), Public liability insurance (+expiry), Bank account
(required); SSM business reg, JPJ driving licence, LHDN tax (optional).
- **`GET /partners/me/documents`** — catalogue merged with submissions + summary (progress %,
  required_verified, activated). Computes `expired` from expiryDate on read.
- **`POST /partners/me/documents`** — upsert one per type → `pending`; IC/SSM validated.
- Client: `servisaku.documents.{list,submit}`.

Frontend:
- `PartnerVerification.jsx` at `/partner/verification` — progress bar + activation banner, docs grouped
  (Identity/Professional/Financial/Business) with status pills, expiry + "renew soon", reject reasons,
  upload bottom-sheet (file + MY number field + expiry).
- Dashboard verification banner (shown until activated) → links to the center.

Verified (curl): catalogue/summary; IC normalise; invalid IC → 400; insurance expiry stored.

> Partner submits → `pending`. **Admin approval (→ verified/rejected) is not built yet** — that's an
> admin-app endpoint (later phase), so `progress`/`activated` stay at the submitted level for now.

## Phase 7 — Analytics (done)

`PartnerAnalytics.jsx` at `/partner/analytics` (linked from the dashboard Performance section).
All computed **client-side** from the partner's bookings (no backend change), using Recharts:
- KPI tiles: avg rating, completion %, cancellation %, repeat clients, avg job duration (from
  lifecycle `started`→`completed`), jobs done.
- Performance score (0–100): 50% rating + 30% completion + 20% reliability.
- Revenue trend (6-month bar), Top services (by net earnings), Busiest times (morning/afternoon/
  evening/night from `time_slot`).

Verified (curl-computed against real data): completion 100% / cancellation 0%, top services correct,
`time_slot` present (peak chart populates). Older bookings lack lifecycle so avg duration shows `—`
until jobs run through the Phase 3a flow.

> Acceptance rate & per-day breakdowns need server-side metrics (no offered-but-declined log) — noted in-UI.

## Phase 8 — Training Center (done)

Schema: `TrainingProgress` model (partnerId+courseId unique; status, score, completedAt) + `User.training`.
Migration `…_training_progress`.

Content: `server/lib/trainingCatalog.js` — authored courses (onboarding, **safety/PPE (DOSH)**, customer
etiquette, service SOP, payments), each with category, video/reading, duration, `mandatory`, and a quiz.
**Quiz answer keys stay server-side** — `publicCourse()` strips them; `gradeQuiz()` grades POSTed answers
(pass mark 70%).

Backend (`server/routes/partners.js`):
- **`GET /partners/me/training`** — catalogue + progress + summary (completed, mandatory_completed, certified, %).
- **`POST /partners/me/training/:courseId/complete`** — grades server-side; records only on pass.
- Client: `servisaku.training.{list,complete}`.

Frontend: `PartnerTraining.jsx` (`/partner/training`, grouped courses + certification progress) and
`PartnerTrainingCourse.jsx` (`/partner/training/:id`, content + assessment + result). Dashboard quick
action swapped Alerts → **Training** (the bell already lives in the top nav).

Verified (curl): answer keys stripped; wrong answers → fail (score 0, not recorded); correct → pass
(100, recorded, mandatory 1/3).

> "Mandatory training before activation" — training exposes `certified`, but it isn't yet combined with
> document verification into a single go-live gate. That unified activation gate (docs + training +
> matching) is a later cross-cutting pass.

## Phase 9 — Reviews · Support · Inventory (done)

One migration `…_reviews_support_inventory`: `Review` gained `reply/repliedAt/reported/reportReason`;
new `SupportTicket` + `InventoryItem` models (+ User relations).

**Reviews** (`server/routes/reviews.js`): `GET /reviews/mine` (partner's reviews + service + reviewer),
`POST /reviews/:id/reply`, `POST /reviews/:id/report` (assigned-partner-only). Page
`PartnerReviews.jsx` (`/partner/reviews`): rating summary + distribution, reply inline, report.

**Support** (new `server/routes/support.js`, mounted `/support`): `GET /support` (own tickets),
`POST /support` (category: technical/payment/booking/report_customer/other). Page `PartnerSupport.jsx`
(`/partner/support`): call/emergency (tel:) + live-chat actions, FAQ accordion, raise-ticket form, ticket list.

**Inventory** (`server/routes/partners.js`): `GET/POST /me/inventory`, `PATCH/DELETE /me/inventory/:id`
(`low_stock` computed = qty ≤ threshold). Page `PartnerInventory.jsx` (`/partner/inventory`): grouped
by product/consumable/equipment, qty steppers, add/delete, low-stock alert banner.

Client: `servisaku.{reviews,support,inventory}.*`. Dashboard gained a "More" list (Reviews, Analytics,
Verification, Inventory, Support).

Verified (curl): reviews list/reply/report + non-owner reply 403; support create/list; inventory
create(low-stock)/restock/delete.

## Phase 10 — Onboarding / registration expansion (done)

Schema: `User.partnerProfile Json?` + `onboardingDraft Json?` + `onboardedAt` (migration `…_partner_onboarding_profile`).
Backend (`server/routes/partners.js`):
- **`GET /partners/me/onboarding`** — draft + profile + submitted flag + account prefill.
- **`PATCH /partners/me/onboarding/draft`** — autosave (merge).
- **`POST /partners/me/onboarding/submit`** — writes `partnerProfile` + base fields, clears draft, sets
  `onboardedAt`, and **syncs preferred areas/categories/radius into `availability`** (so matching has them).
- Client: `servisaku.onboarding.{get,saveDraft,submit}`.

Frontend: `PartnerOnboarding.jsx` rebuilt (was on the old green theme **and its submit was broken** —
it called a non-existent `PartnerAvailability.bulkCreate`). New 6-step flow in the partner design system
with **draft autosave** + resume: Personal (name/phone/gender/DOB) → Professional (bio/experience/skills/
categories/languages) → Coverage (areas/radius/vehicle/business) → Portfolio (image upload) → Payments
(bank/IC/LHDN) → Review. Identity KYC files still go through the Verification Center.

Verified (curl): prefill, draft save+persist, submit clears draft + sets profile + syncs availability.

## Required backend APIs (not yet available)

Phase 1 computes what booking data allows and shows `—` for the rest. These need real endpoints:

| Need | Proposed endpoint | Notes |
|------|-------------------|-------|
| Acceptance rate, avg job duration, peak hours | `GET /partners/me/metrics` | server-side aggregation; client can't derive acceptance (no offered-but-declined log) |
| Online/availability state | `PATCH /partners/me/availability` | persist online flag + working days/hours/vacation/radius (Phase 5) |
| Wallet ledger | `GET /partners/me/wallet`, `POST /partners/me/withdrawals` | balance, pending, withdrawable, history, bonuses/penalties (Phase 4) |
| Verification status | `GET /partners/me/verification` | per-document status: identity/bank/certs/insurance (Phase 6) |
| Training catalog + progress | `GET /training`, `POST /training/:id/complete` | mandatory-before-activation gate (Phase 8) |
| Photo upload (before/after) | `POST /bookings/:id/photos` | object storage + timestamp/geo metadata (Phase 3) |
| Extra services approval | `POST /bookings/:id/addons` | customer-approved mid-job add-ons → invoice update (Phase 3) |

## Roadmap

1. ✅ Foundation primitives + Dashboard
2. ✅ Booking Detail w/ **dynamic service workflow** (render every customer answer) + invoice
3. ✅ Service execution: (3a) before/after photo verification + lifecycle timestamps + timeline · (3b) extra services + customer approval
4. ✅ Wallet
5. ✅ Availability
6. ✅ Verification Center + Documents (Malaysia: MyKad/SSM/CIDB/ST/insurance)
7. ✅ Analytics (charts)
8. ✅ Training Center
9. ✅ Reviews, Support, Inventory
10. ✅ Onboarding/registration expansion (drafts, identity, portfolio, payments)
11. Auth upgrade (refresh token, remember-me, WebAuthn biometric)
12. Perf/offline (React Query migration, pagination, error boundaries); optional TS migration

> The codebase is JavaScript/JSX. A strict-TypeScript migration is tracked as Phase 12 rather than done piecemeal.
