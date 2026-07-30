import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';
import { getAppwriteUserFromJWT, isAppwriteConfigured } from '../appwrite.js';

// Appwrite JWTs are short-lived and verified by a network call to Appwrite, so
// cache the resolved local-user payload per token to avoid a round-trip on
// every API request. Cleared naturally as tokens rotate.
const awCache = new Map(); // token -> { user, exp }
const AW_TTL_MS = 5 * 60 * 1000;

async function resolveAppwriteUser(token) {
  const hit = awCache.get(token);
  if (hit && hit.exp > Date.now()) return hit.user;

  const aw = await getAppwriteUserFromJWT(token); // throws if invalid/expired

  // Link to the local Postgres user by Appwrite id (stored in firebaseUid),
  // then email, then phone; create one on first sight.
  let user = await prisma.user.findFirst({ where: { firebaseUid: aw.$id } });
  if (!user && aw.email) user = await prisma.user.findUnique({ where: { email: aw.email } });
  if (!user && aw.phone) user = await prisma.user.findFirst({ where: { phone: aw.phone } });
  if (!user) {
    user = await prisma.user.create({
      data: { firebaseUid: aw.$id, email: aw.email || null, phone: aw.phone || null, fullName: aw.name || 'User', role: 'consumer' },
    });
  } else if (!user.firebaseUid) {
    user = await prisma.user.update({ where: { id: user.id }, data: { firebaseUid: aw.$id } });
  }

  const payload = { id: user.id, email: user.email, role: user.role };
  awCache.set(token, { user: payload, exp: Date.now() + AW_TTL_MS });
  return payload;
}

export async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = header.slice(7);

  // Our own JWTs carry { id, role }; anything else we treat as an Appwrite JWT.
  let decoded = null;
  try { decoded = jwt.decode(token); } catch { /* not a JWT we can decode */ }
  const looksLikeAppJwt = decoded && decoded.id && decoded.role;

  if (!looksLikeAppJwt && isAppwriteConfigured()) {
    try {
      req.user = await resolveAppwriteUser(token);
      return next();
    } catch { /* fall through to legacy verification */ }
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}
