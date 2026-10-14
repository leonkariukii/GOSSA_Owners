import { buildHash } from '../lib/router.js';

export default function Link({ to, query, current, className, children, ...rest }) {
  return (
    <a
      href={buildHash(to, query)}
      aria-current={current ? 'page' : undefined}
      className={className}
      {...rest}
    >
      {children}
    </a>
  );
}
