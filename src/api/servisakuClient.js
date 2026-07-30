/**
 * servisakuClient.js — ServisAku API layer entry point
 *
 * Resolves to either the real Express backend (`apiClient`) or the
 * localStorage `mockClient` (demo mode, e.g. Netlify / offline).
 *
 * Mode is controlled by `VITE_BACKEND`:
 *   - "real"  → always use the real API (no probing)
 *   - "mock"  → always use demo mode
 *   - "auto"  → (default) probe /api/health once and pick accordingly
 *
 * Hardening: in "auto" mode the resolved client is probed periodically so the
 * app can recover if the backend starts after page load — BUT it will never
 * switch client type while a session is active, because a token minted by one
 * backend is invalid on the other and silently flipping mid-session logs the
 * user out. `readyPromise` resolves once the initial resolution is done so
 * AuthContext can wait before its first auth.me() call.
 */
import { apiClient } from './apiClient';
import { mockClient } from './mockClient';

const MODE = (import.meta.env.VITE_BACKEND || 'auto').toLowerCase();
const clientFor = (kind) => (kind === 'real' ? apiClient : mockClient);

let resolvedKind = MODE === 'real' ? 'real' : MODE === 'mock' ? 'mock' : null;
let resolvedClient = resolvedKind ? clientFor(resolvedKind) : null;

let _resolve;
export const readyPromise = new Promise((res) => { _resolve = res; });

const hasSession = () =>
  !!localStorage.getItem('auth_token') || !!localStorage.getItem('mock_active_user_id');

async function probe() {
  try {
    const apiBase = import.meta.env.VITE_API_BASE || '/api';
    const res = await fetch(`${apiBase}/health`, { signal: AbortSignal.timeout(3000) });
    const contentType = res.headers.get('content-type') || '';
    // Only trust a real JSON response — a Netlify SPA redirect returns HTML.
    if (!res.ok || !contentType.includes('application/json')) throw new Error('not json');
    return 'real';
  } catch {
    return 'mock';
  }
}

function announce(kind) {
  if (kind === 'real') console.log('✅ ServisAku — real backend connected');
  else console.warn('⚠️  ServisAku — no backend, using demo mode');
}

async function resolveInitial() {
  if (resolvedKind) { announce(resolvedKind); _resolve(resolvedClient); return; } // forced mode
  resolvedKind = await probe();
  resolvedClient = clientFor(resolvedKind);
  announce(resolvedKind);
  _resolve(resolvedClient);
}

resolveInitial();

// Auto mode only: re-probe so we can recover if the backend comes up after
// load. Never flip while logged in — that would invalidate the live session.
if (MODE === 'auto') {
  setInterval(async () => {
    if (hasSession()) return;
    const kind = await probe();
    if (kind === resolvedKind) return;
    resolvedKind = kind;
    resolvedClient = clientFor(kind);
    console.warn(`ℹ️  ServisAku — backend mode switched to ${kind} (no active session)`);
  }, 30_000);
}

// Before the initial probe resolves, default to demo mode rather than hitting a
// backend that may not exist. AuthContext awaits `readyPromise` first, so this
// fallback is only for incidental early access.
export const servisaku = new Proxy({}, {
  get(_, prop) {
    return (resolvedClient ?? mockClient)[prop];
  },
});

export default servisaku;
