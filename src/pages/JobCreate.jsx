import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from '../components/Link.jsx';
import RecordForm from '../components/RecordForm.jsx';
import { applyJobUpdate } from '../lib/cache.js';
import { JOB_CREATE_FIELDS, emptyValues } from '../lib/forms.js';
import { jobPath, buildHash, navigate } from '../lib/router.js';
import { createJob } from '../lib/services/jobs.js';

const EMPTY = emptyValues(JOB_CREATE_FIELDS);

export default function JobCreate() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: createJob,
    onSuccess: (job) => {
      applyJobUpdate(queryClient, job);
      navigate(buildHash(jobPath(job.id)));
    },
  });

  return (
    <section className="panel" aria-labelledby="new-job-title">
      <div className="page-head">
        <h1 id="new-job-title">New job</h1>
        <Link to="/jobs">Back to jobs</Link>
      </div>
      <RecordForm
        mode="create"
        fields={JOB_CREATE_FIELDS}
        values={EMPTY}
        pending={mutation.isPending}
        error={mutation.error}
        submitLabel="Create job"
        onSubmit={(payload) => mutation.mutate(payload)}
      />
    </section>
  );
}
