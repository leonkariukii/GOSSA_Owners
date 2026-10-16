import { dashboardKey } from './services/dashboard.js';
import { jobKeys } from './services/jobs.js';
import { mechanicKeys } from './services/mechanics.js';

/** Store the server-confirmed job and refresh everything it can affect. */
export function applyJobUpdate(queryClient, job) {
  const detailKey = jobKeys.detail(job.id);
  queryClient.setQueryData(detailKey, job);
  queryClient.invalidateQueries({
    predicate: ({ queryKey }) => {
      const [root, kind, id] = queryKey;
      if (root === 'jobs') return !(kind === 'detail' && id === job.id);
      return root === 'mechanics' || root === dashboardKey[0];
    },
  });
}

export function applyMechanicUpdate(queryClient, mechanic) {
  queryClient.setQueryData(mechanicKeys.detail(mechanic.id), mechanic);
  queryClient.invalidateQueries({
    predicate: ({ queryKey }) => {
      const [root, kind, id] = queryKey;
      if (root === 'mechanics') return !(kind === 'detail' && id === mechanic.id);
      return root === 'jobs' || root === dashboardKey[0];
    },
  });
}
