// Minimal hash router helpers. The URL hash is the source of truth:
//   #/jobs?status=open&page=2  ->  { path: '/jobs', query: { status: 'open', page: '2' } }

export function parseHash(hash = '') {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const queryIndex = raw.indexOf('?');
  let path = queryIndex >= 0 ? raw.slice(0, queryIndex) : raw;
  const search = queryIndex >= 0 ? raw.slice(queryIndex + 1) : '';
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, '') || '/';

  const query = {};
  for (const [key, value] of new URLSearchParams(search)) {
    if (!(key in query)) query[key] = value;
  }
  return { path, query };
}

export function buildHash(path, query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  return `#${path}${search ? `?${search}` : ''}`;
}

export const jobPath = (id) => `/jobs/${encodeURIComponent(id)}`;
export const mechanicPath = (id) => `/mechanics/${encodeURIComponent(id)}`;

function decode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

export function matchRoute(path) {
  const segments = path.split('/').filter(Boolean).map(decode);
  if (segments.includes(null)) return { name: 'not-found', params: {} };
  const [first, second, ...rest] = segments;
  if (rest.length > 0) return { name: 'not-found', params: {} };

  if (!first) return { name: 'dashboard', params: {} };
  if (first === 'settings' && !second) return { name: 'settings', params: {} };
  if (first === 'jobs') {
    if (!second) return { name: 'jobs', params: {} };
    if (second === 'new') return { name: 'job-new', params: {} };
    return { name: 'job', params: { id: second } };
  }
  if (first === 'mechanics') {
    if (!second) return { name: 'mechanics', params: {} };
    return { name: 'mechanic', params: { id: second } };
  }
  return { name: 'not-found', params: {} };
}

export function navigate(to, { replace = false } = {}) {
  if (replace) {
    window.history.replaceState(null, '', to);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = to;
  }
}
