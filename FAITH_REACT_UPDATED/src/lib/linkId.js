// Keeps raw database ids out of the address bar: /monitoring/detail?id=3 becomes ?id=YXN0cmE6Mw.
// This is OBFUSCATION, not security: anyone who knows the format can decode it, so every API call must still be
// authorised on the server. Plain numeric ids (old bookmarks, emailed links) are still understood.
const PREFIX = 'astra:';

export function encId(id) {
  const n = Number(id);
  if (!Number.isFinite(n)) return String(id);
  return btoa(PREFIX + n).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decId(token) {
  const t = String(token ?? '').trim();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  try {
    const raw = atob(t.replace(/-/g, '+').replace(/_/g, '/'));
    if (raw.startsWith(PREFIX) && /^\d+$/.test(raw.slice(PREFIX.length))) return parseInt(raw.slice(PREFIX.length), 10);
  } catch { /* not a token */ }
  return NaN;
}
