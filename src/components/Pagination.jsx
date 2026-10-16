import Link from './Link.jsx';

export default function Pagination({ page, pageSize, total, to, queryForPage, label = 'Pagination' }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className="pagination" aria-label={label}>
      {page > 1 ? (
        <Link to={to} query={queryForPage(page - 1)} rel="prev">
          Previous
        </Link>
      ) : (
        <span aria-disabled="true" className="disabled">
          Previous
        </span>
      )}
      <span>
        Page {page} of {pages} &middot; {total} total
      </span>
      {page < pages ? (
        <Link to={to} query={queryForPage(page + 1)} rel="next">
          Next
        </Link>
      ) : (
        <span aria-disabled="true" className="disabled">
          Next
        </span>
      )}
    </nav>
  );
}
