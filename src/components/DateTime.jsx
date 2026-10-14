import { useTimeZone } from '../hooks/useSession.js';
import { formatDateTime } from '../lib/format.js';

export default function DateTime({ value }) {
  const timeZone = useTimeZone();
  if (!value) return <>{'—'}</>;
  return <time dateTime={value}>{formatDateTime(value, timeZone)}</time>;
}
