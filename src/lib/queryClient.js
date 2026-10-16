import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError, setCsrfToken } from './api.js';
import { sessionKey } from './services/auth.js';

/** Drop all server state and mark the session as signed out. */
export function clearSession(client) {
  setCsrfToken(null);
  client.removeQueries({ predicate: ({ queryKey }) => queryKey[0] !== sessionKey[0] });
  client.setQueryData(sessionKey, null);
}

export function createQueryClient() {
  const handleError = (error) => {
    if (!(error instanceof ApiError)) return;
    // A 401 while signed in means the session ended. Failed logins happen while
    // signed out, so they are ignored here.
    if (error.status === 401 && client.getQueryData(sessionKey)) clearSession(client);
    if (error.status === 403 && error.code === 'CSRF_FAILED') {
      client.invalidateQueries({ queryKey: sessionKey });
    }
  };
  const client = new QueryClient({
    queryCache: new QueryCache({ onError: handleError }),
    mutationCache: new MutationCache({ onError: handleError }),
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  return client;
}
