// ─────────────────────────────────────────────────────────────────────────────
// File uploads — Appwrite Storage adapter.
//
// Before this, nothing in the codebase actually accepted a file: booking photos
// (POST /bookings/:id/photos) and PartnerDocument.fileUrl both take a URL that
// something else was expected to produce. Damage-claim evidence, dispute
// evidence and support attachments all need real uploads, so this is built once
// and shared rather than three times.
//
// Appwrite is already a dependency (server/appwrite.js, src/lib/appwrite.js), so
// its Storage service is used instead of introducing a second cloud vendor.
//
// Pluggable + inert when unconfigured, mirroring notifications/push.js: without
// APPWRITE_STORAGE_BUCKET_ID it reports not-ready and the routes answer 503
// rather than failing in some confusing way mid-upload.
//
// Env: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY,
//      APPWRITE_STORAGE_BUCKET_ID
// ─────────────────────────────────────────────────────────────────────────────
import { Client, Storage, ID } from 'node-appwrite';
import { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID } from '../../appwrite.js';

const BUCKET_ID = process.env.APPWRITE_STORAGE_BUCKET_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';

export const isUploadReady = () => Boolean(APPWRITE_PROJECT_ID && API_KEY && BUCKET_ID);

// ─── Limits ──────────────────────────────────────────────────────────────────
export const LIMITS = {
  image: 10 * 1024 * 1024, // 10 MB
  video: 100 * 1024 * 1024, // 100 MB
  document: 10 * 1024 * 1024,
};

// Allow-list of what may be uploaded, with the magic bytes that prove it.
// Validating by extension or by the client-supplied Content-Type is worthless —
// both are attacker-controlled. These signatures are checked against the actual
// bytes.
const SIGNATURES = [
  { kind: 'image', mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { kind: 'image', mime: 'image/png', ext: 'png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { kind: 'image', mime: 'image/webp', ext: 'webp', test: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP' },
  { kind: 'image', mime: 'image/heic', ext: 'heic', test: (b) => ascii(b, 4, 4) === 'ftyp' && ['heic', 'heix', 'mif1', 'hevc'].includes(ascii(b, 8, 4)) },
  { kind: 'video', mime: 'video/mp4', ext: 'mp4', test: (b) => ascii(b, 4, 4) === 'ftyp' && ['isom', 'mp42', 'mp41', 'avc1', 'iso2'].includes(ascii(b, 8, 4)) },
  { kind: 'video', mime: 'video/quicktime', ext: 'mov', test: (b) => ascii(b, 4, 4) === 'ftyp' && ascii(b, 8, 4) === 'qt  ' },
  { kind: 'document', mime: 'application/pdf', ext: 'pdf', test: (b) => ascii(b, 0, 4) === '%PDF' },
];

function ascii(buf, offset, length) {
  if (!buf || buf.length < offset + length) return '';
  return buf.subarray(offset, offset + length).toString('latin1');
}

/**
 * Identify a buffer by its content.
 * @returns {{ kind, mime, ext } | null} null when the type is not allowed
 */
export function detectType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  return SIGNATURES.find((s) => s.test(buffer)) ?? null;
}

/**
 * Validate an uploaded buffer. Returns { ok, type, error } — never throws, so
 * routes can turn a rejection into a clean 400.
 */
export function validateUpload(buffer, { allow = ['image', 'video', 'document'] } = {}) {
  if (!buffer?.length) return { ok: false, error: 'Empty file' };

  const type = detectType(buffer);
  if (!type) {
    return { ok: false, error: 'Unsupported file type. Allowed: JPEG, PNG, WebP, HEIC, MP4, MOV, PDF' };
  }
  if (!allow.includes(type.kind)) {
    return { ok: false, error: `${type.kind} files are not accepted here` };
  }
  const limit = LIMITS[type.kind];
  if (buffer.length > limit) {
    return { ok: false, error: `File is too large (max ${Math.round(limit / 1024 / 1024)} MB for ${type.kind}s)` };
  }
  return { ok: true, type };
}

// ─── Storage ─────────────────────────────────────────────────────────────────
function storageClient() {
  const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID)
    .setKey(API_KEY);
  return new Storage(client);
}

/**
 * Upload a validated buffer.
 *
 * NOTE ON SCALE: this proxies bytes through the API, which is fine for photos
 * and acceptable for the occasional short video. If evidence upload volume
 * grows, move to direct-to-storage with a server-issued upload token — the
 * routes and the returned shape can stay the same.
 *
 * @returns {Promise<{ fileId, url, mimeType, sizeBytes, kind }>}
 */
export async function uploadBuffer(buffer, { filename, type, ownerId }) {
  if (!isUploadReady()) {
    throw new Error('File storage is not configured (set APPWRITE_STORAGE_BUCKET_ID and APPWRITE_API_KEY)');
  }
  const storage = storageClient();
  const fileId = ID.unique();
  const safeName = `${fileId}.${type.ext}`;

  // node-appwrite v27 accepts a web File for createFile.
  const file = new File([buffer], safeName, { type: type.mime });
  await storage.createFile(BUCKET_ID, fileId, file);

  return {
    fileId,
    // Stored as a path, not a bare Appwrite URL: evidence must be fetched
    // through our API so access can be checked per request (see signedUrl).
    url: `/api/uploads/${fileId}`,
    filename: filename || safeName,
    mimeType: type.mime,
    sizeBytes: buffer.length,
    kind: type.kind,
    ownerId: ownerId ?? null,
  };
}

/** Stream a stored file back. Callers must authorize BEFORE calling this. */
export async function downloadFile(fileId) {
  if (!isUploadReady()) throw new Error('File storage is not configured');
  const storage = storageClient();
  const [meta, bytes] = await Promise.all([
    storage.getFile(BUCKET_ID, fileId),
    storage.getFileDownload(BUCKET_ID, fileId),
  ]);
  return {
    buffer: Buffer.from(bytes),
    mimeType: meta.mimeType,
    sizeBytes: meta.sizeOriginal,
    name: meta.name,
  };
}

export async function deleteFile(fileId) {
  if (!isUploadReady()) return false;
  try {
    await storageClient().deleteFile(BUCKET_ID, fileId);
    return true;
  } catch {
    return false;
  }
}
