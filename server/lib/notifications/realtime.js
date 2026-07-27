// ─────────────────────────────────────────────────────────────────────────────
// Real-time transport (Socket.IO). The dispatcher stays transport-agnostic and
// only calls the emit helpers here; `attachRealtime` (called from index.js) wires
// the actual io instance in. When no io is attached (e.g. unit tests), every
// emit is a safe no-op.
//
// Rooms: each authenticated socket joins `user:{userId}`, so a notification for a
// user reaches all of their connected devices/tabs at once (cross-device sync).
// ─────────────────────────────────────────────────────────────────────────────
import jwt from 'jsonwebtoken';

let io = null;

export function userRoom(userId) {
  return `user:${userId}`;
}

/**
 * Attach a Socket.IO server, authenticating each connection by JWT (same token
 * the REST API uses) and joining it to the caller's user room.
 */
export function attachRealtime(server, { cors } = {}) {
  // Lazy import so environments without socket.io installed still boot the REST API.
  return import('socket.io').then(({ Server }) => {
    io = new Server(server, {
      cors: cors || { origin: true, credentials: true },
      path: '/socket.io',
    });

    io.use((socket, next) => {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('Unauthorized'));
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.data.userId = decoded.id;
        socket.data.role = decoded.role;
        return next();
      } catch {
        return next(new Error('Invalid token'));
      }
    });

    io.on('connection', (socket) => {
      const { userId } = socket.data;
      if (userId) socket.join(userRoom(userId));
      // Allow a client to (re)subscribe explicitly if it reconnects.
      socket.on('notifications:subscribe', () => {
        if (userId) socket.join(userRoom(userId));
      });
    });

    return io;
  });
}

export function getIo() {
  return io;
}

export function isRealtimeReady() {
  return Boolean(io);
}

/** Push a freshly-created notification to all of a user's connected clients. */
export function emitNotification(userId, notification) {
  if (!io || !userId) return;
  io.to(userRoom(userId)).emit('notification:new', notification);
}

/** Broadcast the user's current unread count so every device updates its badge. */
export function emitUnreadCount(userId, count) {
  if (!io || !userId) return;
  io.to(userRoom(userId)).emit('notification:unread_count', { count });
}

/** Notify a user's clients that a notification's read/archive state changed. */
export function emitNotificationUpdate(userId, payload) {
  if (!io || !userId) return;
  io.to(userRoom(userId)).emit('notification:update', payload);
}
