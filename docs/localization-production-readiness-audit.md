# Localization production-readiness audit

**Baseline:** `71c813b` · **Scope:** consumer Malay localization, frontend + backend
**Method:** static analysis of the full en/ms corpus, live HTTP against a seeded server, and a live browser session against the consumer dev build.

---

## Verdict

**Not yet ready for production review — three consumer-visible defects block it.**

The engineering claimed complete in the baseline is genuinely complete on the surfaces it covers: placeholder integrity is perfect, the locale architecture is single-sourced, and every error, notification, legal and chatbot-answer surface localizes correctly under all four locale conditions.

What the earlier verification did not cover is **data-driven rendering**. Coverage was measured over translation *keys* and over *literal* English in JSX. Neither measure can see a React component that renders `{question.label}` straight from an API response. That blind spot hides the highest-impact gap found here: Step 1 of the booking wizard is in English for every Malay customer, even though all 167 questions and 399 options are fully translated in the database.

---

## Blocking defects

### B1 — Booking wizard renders English questions and options

The single most consumer-visible gap. Live capture from `/book-service/ac-servicing` with the UI in Malay:

> Langkah 1 daripada 6 · Pilihan · **AC units by HP*** (wajib) · 1.0 HP · **Mount type*** (wajib) · **Wall-mounted** · **Cassette / ceiling (per unit)** · Teruskan
> *Unit penyaman udara mengikut HP diperlukan*

The chrome is Malay, the questions are English — and the validation error underneath calls the **same question** *"Unit penyaman udara mengikut HP"*. The server has the Malay and uses it; the form never receives it.

| Layer | State |
|---|---|
| Database | `labelMy` present and correct for all 167 questions, 399 options |
| Pricing engine | uses `labelMy` (that is why the error is Malay) |
| Quote breakdown | localizes server-side — correct |
| **API response** | `mapQuestion()` in `server/lib/catalog.js:89` emits `label` only — no `label_my` |
| **Client** | `QuestionRenderer.jsx:32,54` and `fields.jsx:75` render `{question.label}` / `{opt.label}` raw, no `tField` |

Both halves need fixing: the API must emit the Malay sibling, and the components must select it.

### B2 — Category names render English across the consumer app

All 12 categories have a correct `name_my`, and the API emits it. `Explore.jsx:102,107` and `CategoryTiles.jsx:46` render `c.name` raw. Verified live on `/explore`: **12 of 12 categories displayed their English name** with `lang=ms`.

The same file uses `tField(s, 'name')` correctly for *services* (lines 226, 275) — so the page shows Malay service names under English category headings.

Also affected: `Wishlist.jsx:50,69,79,87`, `StepF.jsx:14` (service name on the review-and-pay step).

### B3 — Chatbot answers in Malay but greets in English

`ChatbotWidget.jsx:28` calls `useChatbot({ role, mode })` without a locale. The hook defaults to `'en'`, sends `locale: 'en'` in the conversation body, and `resolveLocale` ranks an explicit locale **above** `Accept-Language` — so the English default overrides the Malay header for the whole conversation.

FAQ answers localize correctly; only the greeting and the stored conversation locale are wrong.

---

## Section results

### 1. Translation integrity

| Check | Result |
|---|---|
| English surviving inside Malay | **3 strings** (below) |
| Indonesian rather than Malaysian Malay | 0 confirmed |
| Terminology drift | 0 confirmed; 1 consistency question |
| Dropped meaning | **2 strings** (below) |

**Over-broad neutral declarations** — 4 entries in `prisma/data/localization-neutral.json` whitelist a whole string because part of it is a technical identifier, so English prose rides along into 7 customer-visible option rows:

| Declared neutral | Problem | Where it shows |
|---|---|---|
| `32" and below` | "and below" is English prose | Screen size, TV size |
| `BLDC / with remote` | "with remote" is English prose | Fan type |
| `Below 1000 sqft` | "Below" is English prose | Property size (×3) |
| `Below 1500 sqft` | "Below" is English prose | Property size |

**Dropped meaning** — both partner-facing, both flagged rather than fixed since partner localization is out of scope:

- `damage_response_required` — EN: *"You have 72 hours to respond."* MS: *"Anda perlu memberi maklum balas."* **The 72-hour deadline is gone.** This is a contractual response window.
- `cash_collected` — EN: *"…has been added to your outstanding balance."* MS: *"…telah dikenakan."* Drops which balance is affected.

**Terminology consistency** — `Order Summary` → *"Ringkasan Pesanan"* and `coupon_min_order` → *"pesanan minimum"* use **pesanan** where the product otherwise uses **tempahan** for the same object. Both are valid Malaysian Malay; the question is whether a customer connects "pesanan" to their "tempahan". Product call, not a translation error.

*Not findings:* `ulasan`/`semakan` for "review" and `perkhidmatan`/`servis` for "service" are correct disambiguations of two different English senses, not drift.

### 2. Financial / legal / security review inventory

**321 strings across 16 topics, 37 carrying a number, percentage or monetary amount.** Full table with EN, MS, file/key, reason and numeric flag: **[`docs/localization-review-queue.md`](localization-review-queue.md)**.

| Topic | Strings | Numeric |
|---|---|---|
| payment (general) | 74 | 10 |
| refund (general) | 43 | 2 |
| damage claim | 39 | 4 |
| security / suspicious login | 33 | 0 |
| dispute rights | 23 | 0 |
| legal / terms | 16 | 0 |
| loyalty terms | 13 | 4 |
| escrow | 13 | 1 |
| refund amount | 10 | 10 |
| payout | 10 | 0 |
| commission | 10 | 1 |
| OTP | 9 | 0 |
| settlement | 9 | 5 |
| membership terms | 7 | 0 |
| card handling | 6 | 0 |
| tax / SST | 6 | 0 |

The commercially binding subset — every one preserves its figure, but every one states a financial commitment in machine-authored Malay:

- `cancel_gt_48h` — Full refund / *Bayaran balik penuh* — more than **48 hours'** notice
- `cancel_4_to_48h` — **75%** refund — 4 to 48 hours' notice
- `cancel_lt_4h` — **50%** refund — less than 4 hours' notice
- `partner_accepted` — **50%** refund — a professional had already accepted
- `settlement_*` / `commission_*` — partner money movement with `{amount}`, `{days}`

### 3. Numeric preservation

**2,067 pairs checked · 2,066 pass · 1 fail.**

Percentages, monetary amounts, durations, limits and quantities were compared as multisets between EN and MS. Sole failure is `damage_response_required` (B1 above, the 72-hour drop). `75%`, `50%`, `RM30`, `48h→48 jam`, `24 jam`, `4 jam` all survive intact.

### 4. Placeholder integrity

**2,067 pairs checked · 0 mismatches.**

Compared by **name and multiset**, not count, across both interpolation styles:

- `{token}` literals in the frontend dictionary and error catalog
- `(d) => ...${d.field}` templates in the notification catalog — rendered in both languages with sentinel data, then compared by which sentinels survived, which also catches a variable silently dropped from a Malay sentence

`{amount}`, `{date}`, `{timeSlot}`, `{otp}`, `{reference}`, `{days}`, `{points}` verified present and identically named on both sides everywhere they appear.

### 5. Locale architecture

**One canonical resolver, as expected.** `server/lib/locale.js` → `localeOf(req)`, a thin wrapper over `server/lib/chatbot/locale.js`. Resolution order confirmed: `?locale` → `Accept-Language` → English.

- **19 modules** import it; **no route implements its own Accept-Language parsing**
- All required surfaces use it: booking calculation, booking creation, notifications, legal, chatbot, validation middleware, business-rule errors
- Notifications render **both** languages at creation and store them; the read path picks with `localeOf(req)` — consistent

**One documented variant:** the chatbot uses `resolveLocale({explicit, userPreferred, message, acceptLanguage})`, which adds message-language detection and account preference ahead of the header. That is a deliberate superset for a conversational surface built on the *same* primitives, not a second parser. It is also the mechanism B3 exploits — `explicit` outranks the header.

`req.body.locale` in `legal.js:69` and `chatbot.js:123` is persisted data (which language a document was accepted in), not request localization. Correct.

**Two response contracts exist by design** and a reviewer needs to know which is which:

| Contract | Surfaces | Client obligation |
|---|---|---|
| **SWAP** — server returns the localized string in the normal field | errors, notifications, legal, chatbot answers, quote breakdown | render verbatim |
| **DUAL** — server returns both `name` + `name_my` | categories, services, help articles | **must use `tField`** |

Every blocking defect above is a DUAL surface whose client half was never wired up. That is the structural lesson.

### 6. Consumer HTTP regression

**52 cells · 42 pass · 10 fail**, all 10 from B1 and B3.

| Surface | Contract | ?locale=en | ?locale=ms | no locale | Accept-Language ms |
|---|---|---|---|---|---|
| Catalogue (categories) | DUAL | ✓ | ✓ | ✓ | ✓ |
| Services | DUAL | ✓ | ✓ | ✓ | ✓ |
| Booking questions | DUAL | ✗ absent | ✗ absent | ✗ absent | ✗ absent |
| Booking options | DUAL | ✗ absent | ✗ absent | ✗ absent | ✗ absent |
| Quote breakdown | SWAP | ✓ | ✓ | ✓ | ✓ |
| Quote fixed labels | SWAP | ✓ | ✓ | ✓ | ✓ |
| Validation errors | SWAP | ✓ | ✓ | ✓ | ✓ |
| Business-rule errors | SWAP | ✓ | ✓ | ✓ | ✓ |
| Notifications | SWAP | ✓ | ✓ | ✓ | ✓ |
| Legal | SWAP | ✓ | ✓ | ✓ | ✓ |
| Help | DUAL | ✓ | ✓ | ✓ | ✓ |
| Chatbot FAQ answers | SWAP | ✓ | ✓ | ✓ | ✓ |
| Chatbot greeting | SWAP | ✓ | ✗ en | ✓ | ✗ en |

### 7. Consumer frontend regression

Live browser session against the consumer dev build.

| Requirement | Result |
|---|---|
| Sends locale to the backend | **Pass** — proven by the server returning a Malay validation error built from the database `labelMy` |
| Receives Malay backend content | **Pass** |
| Renders it without overriding with English | **Pass** for SWAP surfaces; **fails** for DUAL surfaces (B1, B2) |
| Preserves Malay after navigation | **Pass** — in-app route change to `/explore` kept `lang=ms` |
| Preserves Malay after reload | **Pass** — survives full page load in both languages |
| Switches back to English | **Pass** — `Step 1 of 6` / `Continue` after switching and reloading |

Booking, quote, notification, error and refund/dispute flows all localize correctly at the API layer; the failures are confined to the client's DUAL-surface rendering.

*Minor:* `index.html` `<title>` is a static English string in both languages.

### 8. Partner isolation

| Check | Result |
|---|---|
| Partner API requests ask for English | **Pass** — `VITE_APP === 'partner'` short-circuits `acceptLanguage()` |
| No `ms-MY` runtime branch shipped to partner | **Pass** — string absent from `dist/partner`, present in `dist/consumer` |
| Partner build succeeds | **Pass** |
| **Partner UI is English-only** | **Fail** |

`LanguageProvider` defaults to `ms` for **both** builds, and six translated shared modules are reachable from the partner app: `nav/BottomNav`, `chatbot/ChatbotWidget`, `ExtraServices`, `ThemeToggle`, `lib/AuthContext`, `lib/PageNotFound` (plus `ErrorBoundary` via `AppShell`).

Concretely, the partner bottom navigation renders **Papan Pemuka · Jadual · Pendapatan · Profil**.

No partner *page* uses `useTranslation`, so this is confined to shared chrome. Whether partners should get English-only or follow the user's language is a product decision — flagged, not changed.

The Malay dictionary is also present in the partner bundle (`useTranslation.js` is imported through `AppShell`, and Vite cannot tree-shake the object literal). Bundle-size cost only.

### 9. English leakage classification

Literal English in JSX was already swept. This pass targeted the class that survived it — API fields rendered raw. **83 raw renders of a localizable field**, classified:

| Class | Count | Notes |
|---|---|---|
| 1 — Consumer-visible, should be translated | **11 confirmed** | B1, B2 sites: `QuestionRenderer` ×2, `fields.jsx`, `CategoryTiles`, `Explore` ×2, `Wishlist` ×4, `StepF` |
| 2 — Partner/admin/agent | 27 | `pages/Partner*`, `components/partner/money.jsx` |
| 3 — Technical identifier | — | `mockClient.js` storage keys, `Architecture.jsx` schema/table names (developer docs page) |
| 4 — Developer-only | — | none reaching a customer |
| 5 — Proper noun | — | ServisAku, payment-provider names |
| 6 — API/request-contract | 33 | deliberate English `ApiError` literals behind role gates (unchanged from baseline) |
| 7 — Language-neutral | 45 | `BottomNav.item.label` and `HowItWorks.hero/step` are already built from `t()`/`[lang]`; `Disputes.d.description` is customer free text and **must not** be translated |

**Acceptance criterion — zero unexpected English in a Malay consumer journey: NOT MET.** Booking Step 1 and every category label fail it.

---

## Recommended order

1. **B1** — emit `label_my` from `mapQuestion()`, use `tField` in `QuestionRenderer` and `fields.jsx`. Highest impact: it is the conversion path.
2. **B2** — `tField` for category names in `Explore`, `CategoryTiles`, `Wishlist`, `StepF`.
3. **B3** — pass the active language into `useChatbot` from `ChatbotWidget`.
4. **Neutral-list correction** — split the 4 over-broad entries so the identifier stays neutral and the prose gets translated.
5. **Partner isolation decision** — English-only or follow-the-user; then implement whichever.
6. **`damage_response_required`** — restore the 72-hour deadline (partner scope).
7. **Linguistic review** — work `docs/localization-review-queue.md`, starting with the 37 numeric strings.

A regression guard for the DUAL-surface class would have caught B1 and B2: assert that every API field with a `_my` sibling is rendered through `tField`. Worth adding alongside `scripts/check-localization.js`.

---

## Standing caveat

All Malay in this codebase is **machine-authored with no native-speaker review**. Several strings carry refund percentages, dispute rights, liability and payment commitments. Placeholder and numeric integrity are now proven; **meaning and register are not**. Section 2's queue exists for that review and should be completed before production.
