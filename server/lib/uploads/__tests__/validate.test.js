// Unit tests for upload content validation — `node --test`. No network, no DB.
//
// The point of these: type is decided by the actual bytes, never by the
// filename or the client-supplied Content-Type, both of which an attacker
// controls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectType, validateUpload, LIMITS } from '../index.js';

// Minimal buffers carrying just the signature bytes plus padding.
const pad = (head, size = 32) => Buffer.concat([Buffer.from(head), Buffer.alloc(Math.max(0, size - head.length))]);

const JPEG = pad([0xff, 0xd8, 0xff, 0xe0]);
const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = pad([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')]);
const HEIC = pad([0, 0, 0, 0x18, ...Buffer.from('ftyp'), ...Buffer.from('heic')]);
const MP4 = pad([0, 0, 0, 0x18, ...Buffer.from('ftyp'), ...Buffer.from('isom')]);
const MOV = pad([0, 0, 0, 0x18, ...Buffer.from('ftyp'), ...Buffer.from('qt  ')]);
const PDF = pad([...Buffer.from('%PDF-1.7')]);

test('recognises each allowed image type', () => {
  assert.equal(detectType(JPEG).mime, 'image/jpeg');
  assert.equal(detectType(PNG).mime, 'image/png');
  assert.equal(detectType(WEBP).mime, 'image/webp');
  assert.equal(detectType(HEIC).mime, 'image/heic');
});

test('recognises video and document types', () => {
  assert.equal(detectType(MP4).mime, 'video/mp4');
  assert.equal(detectType(MOV).mime, 'video/quicktime');
  assert.equal(detectType(PDF).mime, 'application/pdf');
});

test('rejects content that is not on the allow-list', () => {
  assert.equal(detectType(pad([...Buffer.from('<?php system($_GET[0]);')])), null);
  assert.equal(detectType(pad([0x4d, 0x5a])), null); // Windows PE executable
  assert.equal(detectType(pad([0x50, 0x4b, 0x03, 0x04])), null); // zip
});

test('a mislabelled file is caught by its bytes', () => {
  // The classic: an executable named "evidence.jpg" with an image Content-Type.
  const disguised = pad([0x4d, 0x5a, 0x90, 0x00]);
  const result = validateUpload(disguised);
  assert.equal(result.ok, false);
  assert.match(result.error, /Unsupported file type/);
});

test('empty and truncated buffers are rejected, not crashed on', () => {
  assert.equal(validateUpload(Buffer.alloc(0)).ok, false);
  assert.equal(validateUpload(null).ok, false);
  assert.equal(detectType(Buffer.from([0xff, 0xd8])), null); // too short to identify
});

test('the kind allow-list narrows what a context accepts', () => {
  assert.equal(validateUpload(MP4, { allow: ['image'] }).ok, false);
  assert.match(validateUpload(MP4, { allow: ['image'] }).error, /video files are not accepted/);
  assert.equal(validateUpload(JPEG, { allow: ['image'] }).ok, true);
});

test('size limits are enforced per kind', () => {
  const bigImage = Buffer.concat([JPEG, Buffer.alloc(LIMITS.image)]);
  const result = validateUpload(bigImage);
  assert.equal(result.ok, false);
  assert.match(result.error, /too large/);

  // The same byte count is fine for a video, which has a larger allowance.
  const okVideo = Buffer.concat([MP4, Buffer.alloc(LIMITS.image)]);
  assert.equal(validateUpload(okVideo).ok, true);
});

test('a valid image passes and reports its kind', () => {
  const result = validateUpload(JPEG);
  assert.equal(result.ok, true);
  assert.equal(result.type.kind, 'image');
  assert.equal(result.type.ext, 'jpg');
});
