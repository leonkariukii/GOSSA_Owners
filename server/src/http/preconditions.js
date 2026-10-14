import { badRequest, preconditionRequired } from '../errors.js';

/** Read the record version from `If-Match: "v<version>"`. Missing header → 428. */
export function requireIfMatch(req) {
  const header = req.get('if-match');
  if (header === undefined || header.trim() === '') {
    throw preconditionRequired();
  }

  const match = /^(?:W\/)?"?v(\d{1,9})"?$/.exec(header.trim());
  if (!match || Number(match[1]) < 1) {
    throw badRequest('If-Match must be a version such as "v1".');
  }
  return Number(match[1]);
}

export function setEtag(res, version) {
  res.set('ETag', `"v${version}"`);
}
