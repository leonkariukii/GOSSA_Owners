import { ApiError } from '../lib/api.js';
import { errorMessage } from '../lib/errors.js';
import Link from './Link.jsx';

export function LoadingState({ label = 'Loading…' }) {
  return (
    <p className="state state-loading" role="status">
      {label}
    </p>
  );
}

export function EmptyState({ children }) {
  return <p className="state state-empty">{children}</p>;
}

export function ErrorState({ error, onRetry, title = 'Something went wrong' }) {
  return (
    <div className="state state-error" role="alert">
      <strong>{title}</strong>
      <p>{errorMessage(error)}</p>
      {error instanceof ApiError && error.requestId ? (
        <small>Reference: {error.requestId}</small>
      ) : null}
      {onRetry ? (
        <div>
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function NotFound({ noun = 'page' }) {
  return (
    <div className="panel state state-notfound" role="alert">
      <h1>Not found</h1>
      <p>We couldn&rsquo;t find that {noun}. It may have been removed or the link is wrong.</p>
      <Link to="/">Back to dashboard</Link>
    </div>
  );
}

/** Mutation/form error banner; lists details not already shown beside a field. */
export function ErrorNotice({ error, shownFields = [] }) {
  if (!error) return null;
  const extra =
    error instanceof ApiError
      ? error.details.filter((d) => !d.field || !shownFields.includes(d.field))
      : [];
  return (
    <div className="notice notice-error" role="alert">
      <p>{errorMessage(error)}</p>
      {extra.length > 0 ? (
        <ul>
          {extra.map((d, i) => (
            <li key={`${d.field}-${i}`}>
              {d.field ? `${d.field}: ` : ''}
              {d.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function SuccessNotice({ children }) {
  if (!children) return null;
  return (
    <p className="notice notice-success" role="status">
      {children}
    </p>
  );
}
