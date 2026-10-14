import { DUTY_LABELS, STATUS_LABELS } from '../lib/constants.js';

export function StatusBadge({ status }) {
  return <span className={`badge badge-status-${status}`}>{STATUS_LABELS[status] ?? status}</span>;
}

export function DutyBadge({ status }) {
  return <span className={`badge badge-duty-${status}`}>{DUTY_LABELS[status] ?? status}</span>;
}

export function ArchivedBadge() {
  return <span className="badge badge-archived">Archived</span>;
}
