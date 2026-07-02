# ServisAku — Consumer app (Expo)

The consumer-facing mobile app, at parity with the consumer website (`../src`).
Built on Expo SDK 56 / expo-router / React 19, sharing the existing Express API
(`../server`). Mirrors the partner app foundation in `../servisaku-mobile`.

## Run

```bash
npm install
cp .env.example .env      # point EXPO_PUBLIC_API_BASE at your API (LAN IP on device)
npm start                 # then press a/i/w, or scan the QR with Expo Go
```

The API must be running: from the repo root, `npm run dev:server` (port 3001).

## Verify

```bash
npx tsc --noEmit               # strict typecheck
npx expo export --platform web # bundles all routes
```

## Structure

- `src/api/client.ts` — typed client for the Express API (auth, catalog, bookings, chat, reviews, notifications).
- `src/context/auth.tsx` — auth provider (login/register/refresh/logout). Browsing is public; booking/bookings/profile require login.
- `src/theme/tokens.ts` — design tokens (shared look with web + partner app).
- `src/components/ui.tsx` — shared UI kit (Screen, Card, Button, Chip, Field, headers…).
- `src/components/booking/` — dynamic booking wizard (QuestionRenderer + 8 widgets, Steps A–F).
- `src/lib/booking-meta.ts` — status state machine, slots, cities, payment methods, schedule surcharge rules.
- `src/app/` — expo-router routes.

## Routes

| Route | Screen |
|---|---|
| `/(tabs)` | Home, Explore, Bookings, Profile |
| `/catalog/[slug]` | Services in a category |
| `/book-service/[slug]` | Booking wizard (Steps A–F, live quote) |
| `/booking/[bookingId]` | Booking detail (extras approval, timeline) |
| `/booking/[bookingId]/invoice` | Invoice |
| `/tracking/[bookingId]` | Live tracking (polled) |
| `/chat/[bookingId]` | Chat (polled) |
| `/review/[bookingId]` | Rate & review |
| `/payment/[bookingId]` | Payment checkout (simulated) |
| `/notifications`, `/profile/edit` | Account |
| `/how-it-works`, `/for-business`, `/promotions`, `/help`, `/login` | Info & auth |

## Known limitations (inherited from the platform)

- **Payment is simulated** — no live gateway is wired anywhere yet.
- **Chat & tracking poll** the REST API (no WebSockets/push yet).
- **Live tracking** shows a status map placeholder (native maps not integrated).
- **OTP login** is not included — email/password + register is the real auth path.
- **Photo upload** in the wizard is deferred to in-chat sharing (no object storage yet).
