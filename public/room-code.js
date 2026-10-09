// Used by the authoritative API and browser: never guess ambiguous characters.
export function normalizeRoomCode(input) {
  if (typeof input !== 'string' || input.length > 64) return null;
  const clean = input.normalize('NFKC').trim().toUpperCase();
  if (!/^[A-Z0-9\s\-\u2010-\u2015\u2212\uFE63\uFF0D]+$/u.test(clean)) return null;
  let compact = clean.replace(/[\s\-\u2010-\u2015\u2212\uFE63\uFF0D]/gu, '');
  if (compact.length === 8 && compact.startsWith('CF')) compact = compact.slice(2);
  return /^[0-9A-F]{6}$/.test(compact) ? `CF-${compact}` : null;
}
