import { ApiError } from '../lib/api.js';
import { ErrorState, LoadingState, NotFound } from './States.jsx';

/** Renders loading / not-found / error (with Retry) states for a query, else children(data). */
export default function QueryBoundary({ query, noun = 'record', children }) {
  if (query.data !== undefined) return children(query.data);
  if (query.isPending) return <LoadingState label={`Loading ${noun}…`} />;
  if (query.error instanceof ApiError && query.error.status === 404) return <NotFound noun={noun} />;
  return (
    <ErrorState
      error={query.error}
      title={`Could not load ${noun}`}
      onRetry={() => query.refetch()}
    />
  );
}
