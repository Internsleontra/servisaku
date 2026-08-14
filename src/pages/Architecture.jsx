import { useState } from 'react';
import { Database, Globe, Lock, Layers, Zap, ArrowRight, Server } from 'lucide-react';

const TABS = [
  { id: 'schema', label: 'DB Schema', icon: Database },
  { id: 'api', label: 'API Structure', icon: Globe },
  { id: 'auth', label: 'Auth Flow', icon: Lock },
  { id: 'folder', label: 'Folder Structure', icon: Layers },
  { id: 'realtime', label: 'Real-time', icon: Zap },
];

const TABLES = [
  {
    name: 'users',
    color: 'border-success',
    badge: 'bg-success-tint text-success',
    fields: [
      { name: 'id', type: 'UUID PK', note: 'gen_random_uuid()' },
      { name: 'role', type: 'ENUM', note: 'consumer|partner|admin|super_admin' },
      { name: 'phone', type: 'VARCHAR(20)', note: 'unique, +60 format' },
      { name: 'phone_verified', type: 'BOOLEAN', note: 'default false' },
      { name: 'email', type: 'VARCHAR(255)', note: 'unique, nullable' },
      { name: 'full_name', type: 'VARCHAR(200)', note: '' },
      { name: 'avatar_url', type: 'TEXT', note: '' },
      { name: 'fcm_token', type: 'TEXT', note: 'Firebase push token' },
      { name: 'language', type: 'CHAR(2)', note: 'en|ms' },
      { name: 'is_active', type: 'BOOLEAN', note: 'default true' },
      { name: 'last_seen_at', type: 'TIMESTAMPTZ', note: '' },
      { name: 'deleted_at', type: 'TIMESTAMPTZ', note: 'soft delete' },
      { name: 'created_at', type: 'TIMESTAMPTZ', note: 'default now()' },
      { name: 'updated_at', type: 'TIMESTAMPTZ', note: 'auto update' },
    ],
  },
  {
    name: 'consumers',
    color: 'border-info',
    badge: 'bg-info-tint text-info',
    fields: [
      { name: 'id', type: 'UUID PK', note: '' },
      { name: 'user_id', type: 'UUID FK', note: '→ users.id' },
      { name: 'default_address_id', type: 'UUID FK', note: '→ addresses.id nullable' },
      { name: 'total_bookings', type: 'INTEGER', note: 'default 0' },
      { name: 'total_spent', type: 'DECIMAL(10,2)', note: 'RM' },
    ],
  },
  {
    name: 'partners',
    color: 'border-chat',
    badge: 'bg-chat-tint text-chat',
    fields: [
      { name: 'id', type: 'UUID PK', note: '' },
      { name: 'user_id', type: 'UUID FK', note: '→ users.id' },
      { name: 'ic_number', type: 'VARCHAR(20)', note: 'encrypted' },
      { name: 'bio', type: 'TEXT', note: '' },
      { name: 'rating_avg', type: 'DECIMAL(3,2)', note: '' },
      { name: 'jobs_completed', type: 'INTEGER', note: '' },
      { name: 'bank_name', type: 'VARCHAR(100)', note: '' },
      { name: 'bank_account', type: 'VARCHAR(50)', note: 'encrypted' },
      { name: 'is_verified', type: 'BOOLEAN', note: 'admin approval' },
      { name: 'verified_at', type: 'TIMESTAMPTZ', note: '' },
      { name: 'onboarding_status', type: 'ENUM', note: 'pending|docs_submitted|approved|rejected' },
    ],
  },
  {
    name: 'bookings',
    color: 'border-warning',
    badge: 'bg-warning-tint text-warning',
    fields: [
      { name: 'id', type: 'UUID PK', note: '' },
      { name: 'booking_ref', type: 'VARCHAR(12)', note: 'unique, e.g. FM-2026-XXXX' },
      { name: 'consumer_id', type: 'UUID FK', note: '→ consumers.id' },
      { name: 'partner_id', type: 'UUID FK', note: '→ partners.id nullable' },
      { name: 'service_id', type: 'UUID FK', note: '→ services.id' },
      { name: 'address_id', type: 'UUID FK', note: '→ addresses.id' },
      { name: 'status', type: 'ENUM', note: 'pending→assigned→accepted→en_route→arrived→started→completed' },
      { name: 'scheduled_date', type: 'DATE', note: '' },
      { name: 'scheduled_time', type: 'TIME', note: '' },
      { name: 'price', type: 'DECIMAL(10,2)', note: 'RM' },
      { name: 'platform_fee', type: 'DECIMAL(10,2)', note: '20% default' },
      { name: 'partner_payout', type: 'DECIMAL(10,2)', note: '80% default' },
      { name: 'coupon_id', type: 'UUID FK', note: 'nullable' },
      { name: 'discount_amount', type: 'DECIMAL(10,2)', note: '' },
      { name: 'payment_status', type: 'ENUM', note: 'pending|paid|escrowed|refunded|failed' },
      { name: 'tracking_token', type: 'VARCHAR(64)', note: 'for real-time tracking' },
      { name: 'notes', type: 'TEXT', note: '' },
      { name: 'started_at', type: 'TIMESTAMPTZ', note: '' },
      { name: 'completed_at', type: 'TIMESTAMPTZ', note: '' },
      { name: 'deleted_at', type: 'TIMESTAMPTZ', note: 'soft delete' },
    ],
  },
  {
    name: 'payments',
    color: 'border-danger',
    badge: 'bg-danger-tint text-danger',
    fields: [
      { name: 'id', type: 'UUID PK', note: '' },
      { name: 'booking_id', type: 'UUID FK', note: '→ bookings.id' },
      { name: 'consumer_id', type: 'UUID FK', note: '→ consumers.id' },
      { name: 'amount', type: 'DECIMAL(10,2)', note: 'RM' },
      { name: 'currency', type: 'CHAR(3)', note: 'MYR' },
      { name: 'method', type: 'ENUM', note: 'card|fpx|tng|boost|grabpay|cash' },
      { name: 'gateway', type: 'ENUM', note: 'stripe|billplz|ipay88' },
      { name: 'gateway_txn_id', type: 'TEXT', note: 'gateway reference' },
      { name: 'gateway_response', type: 'JSONB', note: 'raw response' },
      { name: 'status', type: 'ENUM', note: 'pending|paid|escrowed|refunded|failed' },
      { name: 'refund_reason', type: 'TEXT', note: '' },
      { name: 'receipt_url', type: 'TEXT', note: '' },
      { name: 'created_at', type: 'TIMESTAMPTZ', note: '' },
    ],
  },
  {
    name: 'partner_availability',
    color: 'border-info',
    badge: 'bg-info-tint text-info',
    fields: [
      { name: 'id', type: 'UUID PK', note: '' },
      { name: 'partner_id', type: 'UUID FK', note: '→ partners.id' },
      { name: 'day_of_week', type: 'SMALLINT', note: '0=Sun, 6=Sat' },
      { name: 'specific_date', type: 'DATE', note: 'override, nullable' },
      { name: 'start_time', type: 'TIME', note: '' },
      { name: 'end_time', type: 'TIME', note: '' },
      { name: 'is_available', type: 'BOOLEAN', note: '' },
      { name: 'max_jobs', type: 'SMALLINT', note: 'default 3' },
      { name: 'service_areas', type: 'TEXT[]', note: 'array of cities' },
    ],
  },
  {
    name: 'chat_messages',
    color: 'border-info',
    badge: 'bg-info-tint text-info',
    fields: [
      { name: 'id', type: 'UUID PK', note: '' },
      { name: 'booking_id', type: 'UUID FK', note: '→ bookings.id' },
      { name: 'sender_id', type: 'UUID FK', note: '→ users.id' },
      { name: 'message_type', type: 'ENUM', note: 'text|image|location|system' },
      { name: 'content', type: 'TEXT', note: '' },
      { name: 'file_url', type: 'TEXT', note: 'S3/GCS URL' },
      { name: 'is_read', type: 'BOOLEAN', note: 'default false' },
      { name: 'read_at', type: 'TIMESTAMPTZ', note: '' },
      { name: 'deleted_at', type: 'TIMESTAMPTZ', note: 'soft delete' },
    ],
  },
  {
    name: 'reviews',
    color: 'border-warning',
    badge: 'bg-warning-tint text-warning',
    fields: [
      { name: 'id', type: 'UUID PK', note: '' },
      { name: 'booking_id', type: 'UUID FK', note: '→ bookings.id, unique' },
      { name: 'partner_id', type: 'UUID FK', note: '→ partners.id' },
      { name: 'consumer_id', type: 'UUID FK', note: '→ consumers.id' },
      { name: 'rating', type: 'SMALLINT', note: '1–5' },
      { name: 'punctuality', type: 'SMALLINT', note: '1–5' },
      { name: 'quality', type: 'SMALLINT', note: '1–5' },
      { name: 'professionalism', type: 'SMALLINT', note: '1–5' },
      { name: 'comment', type: 'TEXT', note: '' },
      { name: 'photos', type: 'TEXT[]', note: '' },
      { name: 'partner_reply', type: 'TEXT', note: '' },
      { name: 'is_visible', type: 'BOOLEAN', note: 'admin moderated' },
      { name: 'deleted_at', type: 'TIMESTAMPTZ', note: '' },
    ],
  },
];

const API_GROUPS = [
  {
    group: 'Auth', color: 'text-success', endpoints: [
      { method: 'POST', path: '/auth/otp/request', desc: 'Request OTP to +60 number' },
      { method: 'POST', path: '/auth/otp/verify', desc: 'Verify OTP, return JWT + refresh token' },
      { method: 'POST', path: '/auth/token/refresh', desc: 'Rotate refresh token' },
      { method: 'POST', path: '/auth/logout', desc: 'Revoke tokens' },
    ],
  },
  {
    group: 'Consumers', color: 'text-info', endpoints: [
      { method: 'GET', path: '/consumers/me', desc: 'Own profile' },
      { method: 'PATCH', path: '/consumers/me', desc: 'Update profile' },
      { method: 'GET', path: '/consumers/me/addresses', desc: 'Address book' },
      { method: 'POST', path: '/consumers/me/addresses', desc: 'Add address' },
    ],
  },
  {
    group: 'Bookings', color: 'text-warning', endpoints: [
      { method: 'POST', path: '/bookings', desc: 'Create booking, trigger partner matching' },
      { method: 'GET', path: '/bookings', desc: 'List bookings (filtered by role)' },
      { method: 'GET', path: '/bookings/:id', desc: 'Booking detail' },
      { method: 'PATCH', path: '/bookings/:id/status', desc: 'Update status (role-gated)' },
      { method: 'POST', path: '/bookings/:id/cancel', desc: 'Cancel with reason' },
      { method: 'GET', path: '/bookings/:id/track', desc: 'Real-time tracking data' },
    ],
  },
  {
    group: 'Payments', color: 'text-danger', endpoints: [
      { method: 'POST', path: '/payments/initiate', desc: 'Create payment intent' },
      { method: 'POST', path: '/payments/webhook', desc: 'Gateway webhook (Stripe/Billplz)' },
      { method: 'POST', path: '/payments/:id/refund', desc: 'Admin-trigger refund' },
      { method: 'GET', path: '/payments/:id/receipt', desc: 'Download receipt PDF' },
    ],
  },
  {
    group: 'Partners', color: 'text-chat', endpoints: [
      { method: 'GET', path: '/partners/:id', desc: 'Public partner profile' },
      { method: 'GET', path: '/partners/me/availability', desc: 'Own availability slots' },
      { method: 'PUT', path: '/partners/me/availability', desc: 'Set availability' },
      { method: 'GET', path: '/partners/me/payouts', desc: 'Payout history' },
      { method: 'POST', path: '/partners/onboard', desc: 'Submit onboarding docs' },
    ],
  },
  {
    group: 'Chat', color: 'text-info', endpoints: [
      { method: 'GET', path: '/chat/:bookingId/messages', desc: 'Load message history' },
      { method: 'POST', path: '/chat/:bookingId/messages', desc: 'Send message' },
      { method: 'WS', path: 'ws://chat/:bookingId', desc: 'Real-time WebSocket channel' },
    ],
  },
  {
    group: 'Admin', color: 'text-ink-secondary', endpoints: [
      { method: 'GET', path: '/admin/dashboard', desc: 'KPI stats overview' },
      { method: 'GET', path: '/admin/bookings', desc: 'All bookings with filters' },
      { method: 'PATCH', path: '/admin/partners/:id/verify', desc: 'Approve/reject partner' },
      { method: 'POST', path: '/admin/coupons', desc: 'Create promo coupon' },
      { method: 'GET', path: '/admin/payouts/pending', desc: 'Payouts to process' },
    ],
  },
];

const FOLDER = `fixmate-backend/
├── src/
│   ├── config/
│   │   ├── database.ts          # Postgres pool + Prisma config
│   │   ├── redis.ts             # Redis for sessions/cache
│   │   ├── firebase.ts          # FCM push notifications
│   │   └── env.ts               # Zod-validated env vars
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts  # OTP, JWT, refresh logic
│   │   │   ├── otp.service.ts   # WhatsApp/SMS via Twilio/Vonage
│   │   │   └── auth.middleware.ts
│   │   │
│   │   ├── users/
│   │   ├── consumers/
│   │   ├── partners/
│   │   │   ├── matching.service.ts  # Partner matching algorithm
│   │   │   └── availability.service.ts
│   │   │
│   │   ├── bookings/
│   │   │   ├── booking.controller.ts
│   │   │   ├── booking.service.ts
│   │   │   ├── booking-status.service.ts
│   │   │   └── booking-engine.service.ts
│   │   │
│   │   ├── payments/
│   │   │   ├── payment.service.ts
│   │   │   ├── escrow.service.ts
│   │   │   ├── payout.service.ts
│   │   │   └── webhooks/
│   │   │       ├── stripe.webhook.ts
│   │   │       └── billplz.webhook.ts
│   │   │
│   │   ├── chat/
│   │   │   ├── chat.gateway.ts  # WebSocket (Socket.IO)
│   │   │   └── chat.service.ts
│   │   │
│   │   ├── notifications/
│   │   │   ├── notification.service.ts
│   │   │   └── push.service.ts  # Firebase FCM
│   │   │
│   │   └── admin/
│   │       ├── admin.controller.ts
│   │       └── analytics.service.ts
│   │
│   ├── shared/
│   │   ├── guards/
│   │   │   ├── jwt.guard.ts
│   │   │   └── roles.guard.ts   # RBAC decorator
│   │   ├── decorators/
│   │   │   └── roles.decorator.ts
│   │   ├── pipes/
│   │   └── exceptions/
│   │
│   ├── database/
│   │   ├── migrations/          # Prisma / Knex migrations
│   │   ├── seeds/
│   │   └── schema.prisma
│   │
│   └── main.ts
│
├── Dockerfile
├── docker-compose.yml           # Postgres + Redis + App
├── .env.example
└── package.json`;

const AUTH_STEPS = [
  { step: 1, actor: 'App', action: 'POST /auth/otp/request { phone: "+60123456789" }', note: '' },
  { step: 2, actor: 'Server', action: 'Validate +60 format → rate limit check (Redis)', note: '5 req/hr per phone' },
  { step: 3, actor: 'Server', action: 'Generate 6-digit OTP → store in Redis (TTL: 5 min)', note: '' },
  { step: 4, actor: 'Server', action: 'Send OTP via Vonage SMS / WhatsApp', note: '' },
  { step: 5, actor: 'App', action: 'User enters OTP → POST /auth/otp/verify { phone, otp }', note: '' },
  { step: 6, actor: 'Server', action: 'Verify OTP from Redis → create/fetch user record', note: '' },
  { step: 7, actor: 'Server', action: 'Issue JWT (15min) + Refresh Token (30d) → store refresh in DB', note: '' },
  { step: 8, actor: 'App', action: 'Store tokens securely → attach JWT in Authorization header', note: '' },
  { step: 9, actor: 'Guard', action: 'Every request → verify JWT signature → decode role', note: '' },
  { step: 10, actor: 'Guard', action: 'RolesGuard checks @Roles(\'admin\') decorator', note: '' },
];

const REALTIME_ITEMS = [
  { title: 'Firebase Realtime DB — Tracking', desc: 'Partner location updates every 5s during en_route/arrived. Consumer sees live map. Key: /tracking/{booking_id}', color: 'bg-warning-tint border-warning/30' },
  { title: 'WebSocket (Socket.IO) — Chat', desc: 'Rooms namespaced by booking_id. Consumer + Partner join room after booking confirmed. Admin can monitor.', color: 'bg-info-tint border-info/30' },
  { title: 'Firebase FCM — Push Notifications', desc: 'Triggered on booking status changes, payment confirmations, chat messages. Device token stored on user.', color: 'bg-success-tint border-success/30' },
  { title: 'Redis Pub/Sub — Internal Events', desc: 'booking.created → trigger partner matching. payment.confirmed → release escrow. Decoupled services.', color: 'bg-danger-tint border-danger/30' },
  { title: 'Polling Fallback — Booking Status', desc: 'Clients poll GET /bookings/:id every 10s as fallback when WebSocket unavailable. Status field drives UI.', color: 'bg-chat-tint border-chat/30' },
];

export default function Architecture() {
  const [tab, setTab] = useState('schema');
  const [expandedTable, setExpandedTable] = useState('bookings');

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <div className="bg-brand px-6 pt-14 pb-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <Server className="h-5 w-5 text-ink-inverse/70" />
            <span className="text-ink-inverse/70 text-xs font-medium uppercase tracking-wider">FixMate</span>
          </div>
          <h1 className="text-2xl font-semibold text-ink-inverse">Backend Architecture</h1>
          <p className="text-ink-inverse/60 text-sm mt-1">Production-grade schema, API, and real-time design</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-0 z-10 bg-surface border-b border-hairline">
        <div className="max-w-5xl mx-auto px-4 overflow-x-auto">
          <div className="flex gap-0 min-w-max">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 px-4 py-3.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${tab === id ? 'border-brand text-brand' : 'border-transparent text-ink-secondary hover:text-ink'}`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* DB Schema */}
        {tab === 'schema' && (
          <div className="space-y-3">
            <p className="text-xs text-ink-secondary mb-4">Click any table to expand fields. All tables include <code className="bg-raised px-1 rounded text-[10px]">created_at</code>, <code className="bg-raised px-1 rounded text-[10px]">updated_at</code>. UUIDs via <code className="bg-raised px-1 rounded text-[10px]">gen_random_uuid()</code>.</p>
            {TABLES.map(t => (
              <div key={t.name} className={`border-l-4 ${t.color} bg-surface border border-hairline rounded-2xl overflow-hidden`}>
                <button
                  onClick={() => setExpandedTable(expandedTable === t.name ? null : t.name)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-raised/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${t.badge}`}>TABLE</span>
                    <span className="font-mono text-sm font-semibold">{t.name}</span>
                    <span className="text-xs text-ink-secondary">{t.fields.length} fields</span>
                  </div>
                  <span className="text-ink-secondary text-xs">{expandedTable === t.name ? '▲' : '▼'}</span>
                </button>
                {expandedTable === t.name && (
                  <div className="border-t border-hairline overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-raised/50">
                          <th className="text-left px-4 py-2 font-semibold text-ink-secondary">Column</th>
                          <th className="text-left px-4 py-2 font-semibold text-ink-secondary">Type</th>
                          <th className="text-left px-4 py-2 font-semibold text-ink-secondary">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {t.fields.map((f, i) => (
                          <tr key={i} className="border-t border-hairline/50">
                            <td className="px-4 py-2 font-mono font-medium">{f.name}</td>
                            <td className="px-4 py-2"><span className="bg-raised px-1.5 py-0.5 rounded font-mono text-[10px]">{f.type}</span></td>
                            <td className="px-4 py-2 text-ink-secondary">{f.note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}

            {/* ER Relationships */}
            <div className="bg-surface border border-hairline rounded-2xl p-5 mt-6">
              <h3 className="text-sm font-semibold mb-4">Entity Relationships</h3>
              <div className="space-y-2 text-xs font-mono">
                {[
                  ['users', '1:1', 'consumers'],
                  ['users', '1:1', 'partners'],
                  ['consumers', '1:N', 'bookings'],
                  ['partners', '1:N', 'bookings'],
                  ['bookings', '1:1', 'payments'],
                  ['bookings', '1:1', 'reviews'],
                  ['bookings', '1:N', 'chat_messages'],
                  ['partners', '1:N', 'partner_availability'],
                  ['consumers', '1:N', 'addresses'],
                  ['coupons', '1:N', 'bookings'],
                ].map(([a, rel, b], i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="bg-raised px-2 py-0.5 rounded text-ink">{a}</span>
                    <span className="text-ink-secondary">{rel}</span>
                    <ArrowRight className="h-3 w-3 text-ink-secondary" />
                    <span className="bg-raised px-2 py-0.5 rounded text-ink">{b}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* API Structure */}
        {tab === 'api' && (
          <div className="space-y-5">
            <div className="bg-brand-tint rounded-2xl p-4 text-xs mb-2">
              <p className="font-semibold mb-1">Base URL</p>
              <code className="font-mono">https://api.fixmate.my/v1</code>
              <p className="text-ink-secondary mt-2">All authenticated routes require: <code>Authorization: Bearer {`{jwt}`}</code></p>
            </div>
            {API_GROUPS.map(g => (
              <div key={g.group} className="bg-surface border border-hairline rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-hairline bg-raised/30">
                  <h3 className={`text-xs font-semibold uppercase tracking-wider ${g.color}`}>{g.group}</h3>
                </div>
                <div className="divide-y divide-border/50">
                  {g.endpoints.map((e, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded font-mono min-w-[40px] text-center ${
                        e.method === 'GET' ? 'bg-success-tint text-success' :
                        e.method === 'POST' ? 'bg-info-tint text-info' :
                        e.method === 'PATCH' ? 'bg-warning-tint text-warning' :
                        e.method === 'PUT' ? 'bg-chat-tint text-chat' :
                        e.method === 'WS' ? 'bg-info-tint text-info' :
                        'bg-danger-tint text-danger'
                      }`}>{e.method}</span>
                      <code className="text-xs font-mono text-ink flex-1">{e.path}</code>
                      <span className="text-xs text-ink-secondary text-right">{e.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Auth Flow */}
        {tab === 'auth' && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
              {[
                { title: 'OTP via SMS/WhatsApp', desc: 'Malaysian +60 numbers. 6-digit code. 5-minute TTL in Redis.', icon: '📱' },
                { title: 'JWT + Refresh Tokens', desc: 'Access token: 15min. Refresh: 30 days. Stored encrypted in DB.', icon: '🔑' },
                { title: 'RBAC Guards', desc: 'consumer, partner, admin, super_admin. Decorator-based role checks.', icon: '🛡️' },
              ].map((c, i) => (
                <div key={i} className="bg-surface border border-hairline rounded-2xl p-4">
                  <span className="text-2xl mb-2 block">{c.icon}</span>
                  <p className="font-semibold text-sm mb-1">{c.title}</p>
                  <p className="text-xs text-ink-secondary">{c.desc}</p>
                </div>
              ))}
            </div>

            <h3 className="text-sm font-semibold mb-3">Authentication Flow</h3>
            <div className="bg-surface border border-hairline rounded-2xl overflow-hidden">
              {AUTH_STEPS.map((s, i) => (
                <div key={i} className="flex items-start gap-4 px-4 py-3 border-b border-hairline/50 last:border-0">
                  <div className="w-6 h-6 rounded-full bg-brand/10 text-brand text-[10px] font-semibold flex items-center justify-center shrink-0 mt-0.5">{s.step}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${s.actor === 'App' ? 'bg-info-tint text-info' : s.actor === 'Guard' ? 'bg-chat-tint text-chat' : 'bg-success-tint text-success'}`}>{s.actor}</span>
                    </div>
                    <p className="text-xs font-mono text-ink">{s.action}</p>
                    {s.note && <p className="text-[10px] text-ink-secondary mt-0.5">{s.note}</p>}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-surface border border-hairline rounded-2xl p-4 mt-4">
              <h4 className="text-xs font-semibold mb-3">Role Permissions Matrix</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-hairline">
                      <th className="text-left py-2 pr-4 font-semibold">Action</th>
                      <th className="text-center py-2 px-2 font-semibold">Consumer</th>
                      <th className="text-center py-2 px-2 font-semibold">Partner</th>
                      <th className="text-center py-2 px-2 font-semibold">Admin</th>
                      <th className="text-center py-2 px-2 font-semibold">Super</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Create booking', '✅', '—', '✅', '✅'],
                      ['Accept/reject job', '—', '✅', '✅', '✅'],
                      ['Update job status', '—', '✅', '✅', '✅'],
                      ['Process refund', '—', '—', '✅', '✅'],
                      ['Verify partner', '—', '—', '✅', '✅'],
                      ['Manage pricing', '—', '—', '—', '✅'],
                      ['View all bookings', '—', '—', '✅', '✅'],
                    ].map(([action, ...cells], i) => (
                      <tr key={i} className="border-b border-hairline/50">
                        <td className="py-2 pr-4 text-ink-secondary">{action}</td>
                        {cells.map((c, j) => <td key={j} className="text-center py-2 px-2">{c}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Folder Structure */}
        {tab === 'folder' && (
          <div className="space-y-4">
            <div className="bg-surface border border-hairline rounded-2xl p-5">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Server className="h-4 w-4 text-brand" /> Backend (Node.js / NestJS)</h3>
              <pre className="text-[11px] font-mono text-ink-secondary leading-relaxed overflow-x-auto whitespace-pre">{FOLDER}</pre>
            </div>

            <div className="bg-surface border border-hairline rounded-2xl p-5">
              <h3 className="text-sm font-semibold mb-3">Infrastructure Stack</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Runtime', value: 'Node.js 20 + NestJS' },
                  { label: 'Database', value: 'PostgreSQL 16 (Supabase)' },
                  { label: 'ORM', value: 'Prisma ORM' },
                  { label: 'Cache', value: 'Redis (Upstash)' },
                  { label: 'Auth', value: 'JWT + OTP (Vonage)' },
                  { label: 'Payments', value: 'Billplz + Stripe' },
                  { label: 'Storage', value: 'Cloudflare R2 / S3' },
                  { label: 'Push', value: 'Firebase FCM' },
                  { label: 'Realtime', value: 'Socket.IO + Firebase RTDB' },
                  { label: 'Deploy', value: 'Railway / Fly.io + Docker' },
                  { label: 'CDN', value: 'Cloudflare' },
                  { label: 'Monitoring', value: 'Sentry + Grafana' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between bg-raised/50 rounded-xl px-3 py-2">
                    <span className="text-[11px] text-ink-secondary">{item.label}</span>
                    <span className="text-[11px] font-semibold">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Real-time */}
        {tab === 'realtime' && (
          <div className="space-y-4">
            <p className="text-xs text-ink-secondary">FixMate uses a multi-channel real-time strategy to handle tracking, chat, notifications, and internal events.</p>
            {REALTIME_ITEMS.map((item, i) => (
              <div key={i} className={`border rounded-2xl p-5 ${item.color}`}>
                <h3 className="text-sm font-semibold mb-2">{item.title}</h3>
                <p className="text-xs text-ink-secondary leading-relaxed">{item.desc}</p>
              </div>
            ))}

            <div className="bg-surface border border-hairline rounded-2xl p-5">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Zap className="h-4 w-4 text-brand" /> Booking Status Event Flow</h3>
              <div className="space-y-2">
                {[
                  { from: 'pending', event: 'partner matched', to: 'assigned', channel: 'Redis pub/sub' },
                  { from: 'assigned', event: 'partner accepts', to: 'accepted', channel: 'WS + FCM' },
                  { from: 'accepted', event: 'partner leaves', to: 'en_route', channel: 'WS + FCM + Tracking' },
                  { from: 'en_route', event: 'partner arrives', to: 'arrived', channel: 'WS + FCM' },
                  { from: 'arrived', event: 'job begins', to: 'started', channel: 'WS + FCM' },
                  { from: 'started', event: 'job done', to: 'completed', channel: 'WS + FCM + Escrow release' },
                ].map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="bg-raised px-2 py-0.5 rounded font-mono">{e.from}</span>
                    <ArrowRight className="h-3 w-3 text-ink-secondary shrink-0" />
                    <span className="text-ink-secondary flex-1">{e.event}</span>
                    <ArrowRight className="h-3 w-3 text-ink-secondary shrink-0" />
                    <span className="bg-brand/10 text-brand px-2 py-0.5 rounded font-mono">{e.to}</span>
                    <span className="text-[10px] text-ink-secondary hidden md:block">{e.channel}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}