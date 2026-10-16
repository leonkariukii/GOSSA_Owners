/**
 * In-memory failure limiter used for sign-in attempts. State is per process, which
 * matches the single-instance v1 deployment.
 */
export function createFailureLimiter({ windowMs, max, now = Date.now }) {
  const failures = new Map();

  function recent(key) {
    const cutoff = now() - windowMs;
    const kept = (failures.get(key) ?? []).filter((time) => time > cutoff);
    if (kept.length > 0) {
      failures.set(key, kept);
    } else {
      failures.delete(key);
    }
    return kept;
  }

  function sweep() {
    for (const key of [...failures.keys()]) {
      recent(key);
    }
  }

  return {
    isLimited: (key) => recent(key).length >= max,
    recordFailure(key) {
      if (failures.size > 10_000) {
        sweep();
      }
      const list = recent(key);
      list.push(now());
      failures.set(key, list);
    },
    reset: (key) => failures.delete(key),
    clear: () => failures.clear(),
  };
}
