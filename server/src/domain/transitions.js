export const JOB_STATUSES = ['open', 'in_progress', 'waiting', 'completed', 'cancelled'];
export const TERMINAL_STATUSES = ['completed', 'cancelled'];
export const ASSIGNABLE_STATUSES = ['open', 'waiting', 'in_progress'];

const TRANSITIONS = {
  open: ['in_progress', 'cancelled'],
  in_progress: ['waiting', 'completed', 'cancelled'],
  waiting: ['in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function canTransition(from, to) {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminal(status) {
  return TERMINAL_STATUSES.includes(status);
}
