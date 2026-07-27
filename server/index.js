import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

// Refuse to boot with a missing/weak signing secret — every auth check depends on it.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('FATAL: JWT_SECRET is missing or too short (min 16 chars). Set it in .env');
  process.exit(1);
}

import authRouter from './routes/auth.js';
import bookingsRouter from './routes/bookings.js';
import couponsRouter from './routes/coupons.js';
import usersRouter from './routes/users.js';
import reviewsRouter from './routes/reviews.js';
import escrowRouter from './routes/escrow.js';
import paymentsRouter from './routes/payments.js';
import refundsRouter from './routes/refunds.js';
import payoutsRouter from './routes/payouts.js';
import chatRouter from './routes/chat.js';
import notificationsRouter from './routes/notifications.js';
import partnerLocationsRouter from './routes/partnerLocations.js';
import partnersRouter from './routes/partners.js';
import supportRouter from './routes/support.js';
import catalogRouter from './routes/catalog.js';
import addressesRouter from './routes/addresses.js';
import notificationSettingsRouter from './routes/notificationSettings.js';
import { attachRealtime, startNotificationWorkers } from './lib/notifications/index.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Same allow-list is shared by the REST CORS layer and the Socket.IO handshake.
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:8081,http://localhost:19006').split(',');

app.use(helmet());
app.use(cors({
  // 5173 = Vite web apps; 8081/19006 = Expo web (consumer/partner mobile apps).
  origin: corsOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// Global limiter + a tighter one for credential endpoints.
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false }));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

const api = express.Router();

api.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// Public catalog (browse + price quote) — no auth.
api.use('/', catalogRouter);

api.use('/auth', authLimiter, authRouter);
api.use('/bookings', bookingsRouter);
api.use('/addresses', addressesRouter);
api.use('/coupons', couponsRouter);
api.use('/users', usersRouter);
api.use('/reviews', reviewsRouter);
api.use('/escrow', escrowRouter);
api.use('/payments', paymentsRouter);
api.use('/refunds', refundsRouter);
api.use('/payouts', payoutsRouter);
api.use('/chat', chatRouter);
api.use('/notifications', notificationsRouter);
api.use('/notification-settings', notificationSettingsRouter);
api.use('/partner-locations', partnerLocationsRouter);
api.use('/partners', partnersRouter);
api.use('/support', supportRouter);

// /api stays the canonical mount; /api/v1 is the forward-compatible alias the
// mobile clients will use (Phase 1 makes v1 canonical).
app.use('/api', api);
app.use('/api/v1', api);

// Global error handler — ApiError carries an intentional status; anything else is a 500
// and the message is not leaked to the client outside development.
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  const message = status >= 500 && process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;
  res.status(status).json({ error: message });
});

// Wrap Express in a bare HTTP server so Socket.IO can share the same port.
const server = http.createServer(app);

// Real-time notifications (in-app badge + center sync across devices).
attachRealtime(server, { cors: { origin: corsOrigins, credentials: true } })
  .then(() => console.log('✅ Real-time notifications ready (Socket.IO)'))
  .catch((err) => console.warn('⚠️  Real-time notifications disabled:', err?.message || err));

// Background workers: release scheduled notifications when they come due.
startNotificationWorkers();

server.listen(PORT, () => {
  console.log(`✅ ServisAku API running on http://localhost:${PORT}`);
});
