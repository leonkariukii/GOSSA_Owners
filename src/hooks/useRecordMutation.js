import { useMutation, useQueryClient } from '@tanstack/react-query';
import { applyJobUpdate, applyMechanicUpdate } from '../lib/cache.js';
import { isStale } from '../lib/errors.js';
import { jobKeys } from '../lib/services/jobs.js';
import { mechanicKeys } from '../lib/services/mechanics.js';

function useRecordMutation({ mutationFn, detailKey, apply, onSuccess }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (record, variables) => {
      apply(queryClient, record);
      onSuccess?.(record, variables);
    },
    onError: (error) => {
      // 412: reload the latest version so the user can review and retry.
      if (isStale(error)) queryClient.invalidateQueries({ queryKey: detailKey });
    },
  });
}

/** Mutation that targets an existing job; refreshes job, lists, history, mechanics, dashboard. */
export function useJobMutation(jobId, mutationFn, onSuccess) {
  return useRecordMutation({ mutationFn, detailKey: jobKeys.detail(jobId), apply: applyJobUpdate, onSuccess });
}

export function useMechanicMutation(mechanicId, mutationFn, onSuccess) {
  return useRecordMutation({
    mutationFn,
    detailKey: mechanicKeys.detail(mechanicId),
    apply: applyMechanicUpdate,
    onSuccess,
  });
}
