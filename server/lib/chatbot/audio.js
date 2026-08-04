// ─────────────────────────────────────────────────────────────────────────────
// Voice note transcription.
//
// THE PRODUCT RULE (docs/11 §L2): a transcription lands in the COMPOSER as
// editable text. It is never sent as a message on the user's behalf. Speech
// recognition is wrong often enough — and Malaysian English and Malay code-
// switching make it wronger — that auto-sending would put words in someone's
// mouth in a support conversation about money.
//
// Inert without a provider, mirroring provider.js and vision.js: no key means
// transcription reports unavailable and the UI asks the person to type instead,
// which is a worse experience but a working one.
// ─────────────────────────────────────────────────────────────────────────────

/** Voice notes are short by nature; anything longer is a misuse of the feature. */
export const MAX_DURATION_SECONDS = 120;
export const MAX_BYTES = 8 * 1024 * 1024;

// Magic bytes, checked against the actual content. Extension and Content-Type
// are attacker-controlled and worthless, the same reasoning as uploads/index.js.
const SIGNATURES = [
  { mime: 'audio/mp4', test: (b) => ascii(b, 4, 4) === 'ftyp' && ['M4A ', 'mp42', 'isom'].includes(ascii(b, 8, 4)) },
  { mime: 'audio/mpeg', test: (b) => (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) || ascii(b, 0, 3) === 'ID3' },
  { mime: 'audio/ogg', test: (b) => ascii(b, 0, 4) === 'OggS' },
  { mime: 'audio/wav', test: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WAVE' },
  { mime: 'audio/webm', test: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
];

function ascii(buf, offset, length) {
  if (!buf || buf.length < offset + length) return '';
  return buf.subarray(offset, offset + length).toString('latin1');
}

/**
 * Identify an audio buffer by its content.
 * @returns {{ mime } | null} null when the format is not accepted
 */
export function detectAudio(buffer) {
  if (!buffer || buffer.length < 12) return null;
  return SIGNATURES.find((s) => s.test(buffer)) ?? null;
}

/**
 * Validate before spending anything on transcription.
 * @returns {{ ok: boolean, mime?: string, error?: { code, message } }}
 */
export function validateAudio(buffer) {
  if (!buffer?.length) return { ok: false, error: { code: 'empty_audio', message: 'No audio was received' } };
  if (buffer.length > MAX_BYTES) {
    return { ok: false, error: { code: 'audio_too_large', message: 'That voice note is too long — please keep it under two minutes' } };
  }
  const type = detectAudio(buffer);
  if (!type) return { ok: false, error: { code: 'unsupported_audio', message: 'That audio format is not supported' } };
  return { ok: true, mime: type.mime };
}

let override = null;

/** Swap the transcriber (tests, or a different vendor). */
export function setTranscriptionProvider(fn) { override = fn; }

export const isTranscriptionReady = () => Boolean(override || process.env.SPEECH_API_KEY);

/**
 * Transcribe a voice note.
 *
 * Returns `{ available: false }` rather than throwing when unconfigured — an
 * absent capability is a normal state the UI handles, not an error.
 *
 * @param {Buffer} buffer
 * @param {object} [opts] { locale }
 * @returns {Promise<{ available, text?, locale?, error? }>}
 */
export async function transcribe(buffer, { locale = 'en' } = {}) {
  const check = validateAudio(buffer);
  if (!check.ok) return { available: true, text: null, error: check.error };

  if (override) {
    const result = await override({ buffer, mime: check.mime, locale });
    return { available: true, text: clean(result?.text), locale: result?.locale || locale };
  }

  if (!isTranscriptionReady()) {
    return {
      available: false,
      error: { code: 'transcription_unavailable', message: 'Voice input is not available right now — please type your message' },
    };
  }

  // Provider wiring lands with the speech vendor decision. Until then this
  // reports unavailable rather than pretending, so the UI degrades to typing
  // instead of showing an empty transcript.
  return {
    available: false,
    error: { code: 'transcription_unavailable', message: 'Voice input is not available right now — please type your message' },
  };
}

/**
 * Tidy a transcript for the composer.
 * Trailing filler and stray punctuation from a recogniser look like the user
 * typed them, and they are about to be sent under the user's name.
 */
export function clean(text) {
  if (!text) return null;
  return String(text)
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:]+|[\s,;:]+$/g, '')
    .trim()
    .slice(0, 2000) || null;
}
