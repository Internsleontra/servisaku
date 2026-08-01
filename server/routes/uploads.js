import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, ApiError, isAdmin } from '../lib/access.js';
import {
  uploadBuffer, downloadFile, validateUpload, isUploadReady, LIMITS,
} from '../lib/uploads/index.js';

const router = Router();
router.use(authenticate);

// Memory storage: files are validated by content and forwarded to Appwrite, so
// they never touch this server's disk. The hard cap is multer's own limit —
// per-kind limits are applied after the type is identified from the bytes.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.video, files: 10 },
});

// Uploading is expensive and a classic abuse vector.
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/uploads — one or more files, field name "files".
// Body may carry `context` (damage_claim | dispute | support | booking_photo)
// and `allow` to narrow the accepted kinds.
router.post('/', uploadLimiter, upload.array('files', 10), asyncHandler(async (req, res) => {
  if (!isUploadReady()) {
    throw new ApiError(503, 'File storage is not configured. Set APPWRITE_STORAGE_BUCKET_ID and APPWRITE_API_KEY.');
  }
  const files = req.files || [];
  if (files.length === 0) throw new ApiError(400, 'No files received (send them as multipart field "files")');

  const allow = typeof req.body?.allow === 'string'
    ? req.body.allow.split(',').map((s) => s.trim()).filter(Boolean)
    : ['image', 'video', 'document'];

  const uploaded = [];
  const rejected = [];

  for (const file of files) {
    // Type comes from the bytes, never from file.mimetype or the filename —
    // both are client-controlled.
    const check = validateUpload(file.buffer, { allow });
    if (!check.ok) {
      rejected.push({ filename: file.originalname, error: check.error });
      continue;
    }
    try {
      const saved = await uploadBuffer(file.buffer, {
        filename: file.originalname,
        type: check.type,
        ownerId: req.user.id,
      });
      // Ownership is recorded so downloads can be authorized later. The row is
      // the access-control record; Appwrite itself never serves these directly.
      await prisma.uploadedFile.create({
        data: {
          fileId: saved.fileId,
          ownerId: req.user.id,
          context: String(req.body?.context || 'general').slice(0, 40),
          filename: saved.filename,
          mimeType: saved.mimeType,
          sizeBytes: saved.sizeBytes,
          kind: saved.kind,
        },
      });
      uploaded.push(saved);
    } catch (err) {
      rejected.push({ filename: file.originalname, error: err.message });
    }
  }

  if (uploaded.length === 0) throw new ApiError(400, rejected[0]?.error || 'Upload failed');
  res.status(201).json({ uploaded, rejected });
}));

// GET /api/uploads/:fileId — stream a file back, access-checked.
//
// Evidence is private. Files are never served from a public bucket URL; every
// read goes through here so the check happens per request and a leaked link
// expires with the session rather than being permanently public.
router.get('/:fileId', asyncHandler(async (req, res) => {
  const record = await prisma.uploadedFile.findUnique({ where: { fileId: req.params.fileId } });
  if (!record) throw new ApiError(404, 'File not found');

  const allowed = isAdmin(req.user)
    || record.ownerId === req.user.id
    || (await canViewViaContext(req.user, record));
  if (!allowed) throw new ApiError(403, 'Forbidden');

  const file = await downloadFile(req.params.fileId);
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Length', file.sizeBytes);
  res.setHeader('Content-Disposition', `inline; filename="${record.filename}"`);
  // Private: never let a shared cache hold someone's evidence photo.
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(file.buffer);
}));

/**
 * Counterparty access. A file attached to a damage claim or dispute must be
 * visible to the other side of that case — otherwise a partner cannot see what
 * they are accused of. Resolved through the owning record, not a flag on the
 * file, so revoking access is a matter of the case's own rules.
 */
async function canViewViaContext(user, record) {
  // Guarded on the model's existence so this file stays usable ahead of the
  // damage-claims migration rather than throwing a TypeError on every download.
  if (record.context === 'damage_claim' && prisma.damageClaim) {
    const claim = await prisma.damageClaim.findFirst({
      where: { evidence: { some: { fileUrl: { contains: record.fileId } } } },
      select: { consumerId: true, partnerId: true },
    }).catch(() => null);
    if (claim && (claim.consumerId === user.id || claim.partnerId === user.id)) return true;
  }
  return false;
}

export default router;
