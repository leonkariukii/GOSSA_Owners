import { useQuery } from '@tanstack/react-query';
import { StatusBadge, ArchivedBadge } from '../components/Badges.jsx';
import DateTime from '../components/DateTime.jsx';
import Field from '../components/Field.jsx';
import Link from '../components/Link.jsx';
import Pagination from '../components/Pagination.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/States.jsx';
import { useMechanicOptions } from '../hooks/useQueries.js';
import { JOB_SORTS, JOB_STATUSES, STATUS_LABELS } from '../lib/constants.js';
import { JOB_DEFAULTS, readJobListState, toApiParams, toHashQuery } from '../lib/listState.js';
import { buildHash, jobPath, navigate } from '../lib/router.js';
import { jobKeys, listJobs } from '../lib/services/jobs.js';

function Filters({ state, mechanics }) {
  function handleSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = readJobListState({
      q: form.get('q'),
      status: form.get('status'),
      mechanic_id: form.get('mechanic_id'),
      include_archived: form.get('include_archived') ? 'true' : 'false',
      created_from: form.get('created_from'),
      created_to: form.get('created_to'),
      sort_by: form.get('sort_by'),
      order: form.get('order'),
      page_size: String(state.page_size),
    });
    navigate(buildHash('/jobs', toHashQuery(next, JOB_DEFAULTS)));
  }

  return (
    <form className="panel filters" onSubmit={handleSubmit} role="search" aria-label="Filter jobs">
      <div className="field-grid">
        <Field label="Search" name="q" type="search" defaultValue={state.q} maxLength={120}
          hint="Job number, customer or registration" />
        <Field label="Status" name="status" defaultValue={state.status}>
          <option value="">All statuses</option>
          {JOB_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </Field>
        <Field label="Mechanic" name="mechanic_id" defaultValue={state.mechanic_id}>
          <option value="">Any mechanic</option>
          {state.mechanic_id && !mechanics.some((m) => m.id === state.mechanic_id) ? (
            <option value={state.mechanic_id}>Selected mechanic</option>
          ) : null}
          {mechanics.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </Field>
        <Field label="Created from" name="created_from" type="date" defaultValue={state.created_from} />
        <Field label="Created to" name="created_to" type="date" defaultValue={state.created_to} />
        <Field label="Sort by" name="sort_by" defaultValue={state.sort_by}>
          {JOB_SORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </Field>
        <Field label="Order" name="order" defaultValue={state.order}>
          <option value="desc">Newest / highest first</option>
          <option value="asc">Oldest / lowest first</option>
        </Field>
        <div className="field field-check">
          <label>
            <input type="checkbox" name="include_archived" defaultChecked={state.include_archived} />
            Include archived
          </label>
        </div>
      </div>
      <div className="button-row">
        <button type="submit">Apply filters</button>
        <Link to="/jobs" className="button ghost">Reset</Link>
      </div>
    </form>
  );
}

export default function JobsList({ query }) {
  const state = readJobListState(query);
  const params = toApiParams(state);
  const jobs = useQuery({ queryKey: jobKeys.list(params), queryFn: () => listJobs(params) });
  const mechanicOptions = useMechanicOptions();
  const mechanics = mechanicOptions.data ?? [];
  const mechanicName = new Map(mechanics.map((m) => [m.id, m.name]));
  const queryForPage = (page) => toHashQuery({ ...state, page }, JOB_DEFAULTS);
  // The form is keyed on the URL so it always reflects the URL state.
  const formKey = buildHash('/jobs', toHashQuery(state, JOB_DEFAULTS));

  return (
    <section aria-labelledby="jobs-title">
      <div className="page-head">
        <h1 id="jobs-title">Jobs</h1>
        <Link to="/jobs/new" className="button">New job</Link>
      </div>
      <Filters key={formKey} state={state} mechanics={mechanics} />
      {jobs.isPending ? <LoadingState label="Loading jobs…" /> : null}
      {jobs.isError ? (
        <ErrorState title="Could not load jobs" error={jobs.error} onRetry={() => jobs.refetch()} />
      ) : null}
      {jobs.data ? (
        <div className="panel" aria-busy={jobs.isFetching}>
          {jobs.data.data.length === 0 ? (
            <EmptyState>
              No jobs match these filters.{' '}
              {state.page > 1 ? <Link to="/jobs" query={queryForPage(1)}>Go to the first page</Link> : null}
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Job</th>
                    <th scope="col">Status</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Vehicle</th>
                    <th scope="col">Mechanic</th>
                    <th scope="col">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.data.data.map((job) => (
                    <tr key={job.id}>
                      <td><Link to={jobPath(job.id)}>{job.job_number}</Link></td>
                      <td>
                        <StatusBadge status={job.status} />
                        {job.archived_at ? <> <ArchivedBadge /></> : null}
                      </td>
                      <td>{job.customer_name}</td>
                      <td>{job.vehicle_registration}</td>
                      <td>
                        {job.assigned_mechanic_id
                          ? (mechanicName.get(job.assigned_mechanic_id) ?? 'Assigned')
                          : 'Unassigned'}
                      </td>
                      <td><DateTime value={job.updated_at} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={jobs.data.page}
            pageSize={jobs.data.page_size}
            total={jobs.data.total}
            to="/jobs"
            queryForPage={queryForPage}
            label="Jobs pagination"
          />
        </div>
      ) : null}
    </section>
  );
}
