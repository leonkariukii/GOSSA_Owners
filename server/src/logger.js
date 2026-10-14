const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

/**
 * Minimal structured JSON logger. Callers must only pass operational fields
 * (request ids, status codes, durations) — never credentials, cookies, tokens or
 * personal data.
 */
export function createLogger({ level = 'info', stream = process.stdout } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;

  function write(name, message, fields = {}) {
    if (LEVELS[name] < threshold) {
      return;
    }
    stream.write(`${JSON.stringify({ time: new Date().toISOString(), level: name, message, ...fields })}\n`);
  }

  return {
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
  };
}
