import { useQuery } from '@tanstack/react-query';
import { jobKeys, getJob } from '../lib/services/jobs.js';
import { getMechanic, listMechanics, mechanicKeys } from '../lib/services/mechanics.js';

export function useJob(id) {
  return useQuery({ queryKey: jobKeys.detail(id), queryFn: () => getJob(id) });
}

export function useMechanic(id) {
  return useQuery({
    queryKey: mechanicKeys.detail(id),
    queryFn: () => getMechanic(id),
    enabled: Boolean(id),
  });
}

/** Non-archived mechanics for pickers (server-paginated, first 100 by name). */
export function useMechanicOptions() {
  return useQuery({
    queryKey: mechanicKeys.options,
    queryFn: async () =>
      (await listMechanics({ page_size: 100, sort_by: 'name', order: 'asc' })).data,
  });
}
