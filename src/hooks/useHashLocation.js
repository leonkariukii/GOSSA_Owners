import { useMemo, useSyncExternalStore } from 'react';
import { matchRoute, parseHash } from '../lib/router.js';

function subscribe(callback) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

const getSnapshot = () => window.location.hash;
const getServerSnapshot = () => '';

export function useHashLocation() {
  const hash = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => {
    const { path, query } = parseHash(hash);
    return { hash, path, query, route: matchRoute(path) };
  }, [hash]);
}
