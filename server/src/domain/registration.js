/**
 * Normalize a vehicle registration for searching and duplicate detection: trim,
 * upper-case, and remove internal whitespace and separator punctuation. The
 * submitted display form is stored separately and never altered.
 */
export function normalizeRegistration(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s\-_.,/\\:;|'"]+/g, '');
}
