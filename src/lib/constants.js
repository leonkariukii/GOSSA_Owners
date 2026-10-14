export const JOB_STATUSES = ['open', 'in_progress', 'waiting', 'completed', 'cancelled'];

export const STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In progress',
  waiting: 'Waiting',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const TRANSITIONS = {
  open: ['in_progress', 'cancelled'],
  in_progress: ['waiting', 'completed', 'cancelled'],
  waiting: ['in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
};

export const TERMINAL_STATUSES = ['completed', 'cancelled'];
export const ASSIGNABLE_STATUSES = ['open', 'in_progress', 'waiting'];

export function transitionLabel(from, to) {
  if (to === 'in_progress') return from === 'waiting' ? 'Resume work' : 'Start work';
  if (to === 'waiting') return 'Put on hold (waiting)';
  if (to === 'completed') return 'Mark completed';
  if (to === 'cancelled') return 'Cancel job';
  return STATUS_LABELS[to] ?? to;
}

export const DUTY_STATUSES = ['available', 'busy', 'off_duty'];
export const DUTY_LABELS = {
  available: 'Available',
  busy: 'Busy',
  off_duty: 'Off duty',
};

export const JOB_SORTS = [
  { value: 'created_at', label: 'Created' },
  { value: 'updated_at', label: 'Last updated' },
  { value: 'job_number', label: 'Job number' },
  { value: 'status', label: 'Status' },
];

export const MECHANIC_SORTS = [
  { value: 'name', label: 'Name' },
  { value: 'created_at', label: 'Created' },
  { value: 'updated_at', label: 'Last updated' },
];

export const DEFAULT_PAGE_SIZE = 25;
