import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ArchivedBadge, DutyBadge, StatusBadge } from '../components/Badges.jsx';
import ConfirmPanel from '../components/ConfirmPanel.jsx';
import DateTime from '../components/DateTime.jsx';
import Field from '../components/Field.jsx';
import Link from '../components/Link.jsx';
import Pagination from '../components/Pagination.jsx';
import QueryBoundary from '../components/QueryBoundary.jsx';
import RecordForm from '../components/RecordForm.jsx';
import { EmptyState, ErrorNotice, ErrorState, LoadingState, SuccessNotice } from '../components/States.jsx';
import { useJobMutation } from '../hooks/useRecordMutation.js';
import { useJob, useMechanic, useMechanicOptions } from '../hooks/useQueries.js';
import {
  ASSIGNABLE_STATUSES,
  STATUS_LABELS,
  TERMINAL_STATUSES,
  TRANSITIONS,
  transitionLabel,
} from '../lib/constants.js';
import { display } from '../lib/format.js';
import { JOB_EDIT_FIELDS, recordToValues } from '../lib/forms.js';
import { jobPath, mechanicPath } from '../lib/router.js';
import {
  archiveJob,
  assignMechanic,
  getJobHistory,
  jobKeys,
  transitionJob,
  updateJob,
} from '../lib/services/jobs.js';

const HISTORY_PAGE_SIZE = 10;

function Detail({ label, children, wide }) {
  return (
    <div className={wide ? 'detail detail-wide' : 'detail'}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function JobSummary({ job }) {
  const mechanic = useMechanic(job.assigned_mechanic_id);
  return (
    <dl className="detail-grid">
      <Detail label="Customer">{job.customer_name}</Detail>
      <Detail label="Customer phone">{display(job.customer_phone)}</Detail>
      <Detail label="Registration">{job.vehicle_registration}</Detail>
      <Detail label="Vehicle">
        {[job.vehicle_make, job.vehicle_model, job.vehicle_year].filter(Boolean).join(' ') || '—'}
      </Detail>
      <Detail label="Odometer">{job.odometer_km == null ? '—' : `${job.odometer_km.toLocaleString('en-GB')} km`}</Detail>
      <Detail label="Mechanic">
        {job.assigned_mechanic_id ? (
          mechanic.data ? (
            <>
              <Link to={mechanicPath(mechanic.data.id)}>{mechanic.data.name}</Link>{' '}
              <DutyBadge status={mechanic.data.duty_status} />
            </>
          ) : (
            'Assigned'
          )
        ) : (
          'Unassigned'
        )}
      </Detail>
      <Detail label="Created"><DateTime value={job.created_at} /></Detail>
      <Detail label="Last updated"><DateTime value={job.updated_at} /></Detail>
      <Detail label="Work requested" wide>{job.work_requested}</Detail>
      <Detail label="Diagnosis" wide>{display(job.diagnosis)}</Detail>
      <Detail label="Work performed" wide>{display(job.work_performed)}</Detail>
      <Detail label="Internal notes" wide>{display(job.internal_notes)}</Detail>
    </dl>
  );
}

function EditPanel({ job, onDone }) {
  const mutation = useJobMutation(job.id, (changes) => updateJob(job, changes), () => onDone('Job details saved.'));
  return (
    <div className="panel">
      <h2>Edit details</h2>
      <RecordForm
        mode="edit"
        fields={JOB_EDIT_FIELDS}
        values={recordToValues(job, JOB_EDIT_FIELDS)}
        version={job.version}
        pending={mutation.isPending}
        error={mutation.error}
        submitLabel="Save changes"
        onSubmit={(changes) => mutation.mutate(changes)}
        onCancel={() => onDone(null)}
      />
    </div>
  );
}

function AssignmentPanel({ job, onDone }) {
  const options = useMechanicOptions();
  const editable = !job.archived_at && ASSIGNABLE_STATUSES.includes(job.status);
  const [choice, setChoice] = useState(null);
  const selected = choice ?? job.assigned_mechanic_id ?? '';
  const mutation = useJobMutation(
    job.id,
    (mechanicId) => assignMechanic(job, mechanicId),
    () => {
      setChoice(null);
      onDone('Assignment updated.');
    },
  );

  if (!editable) {
    return (
      <div className="panel">
        <h2>Assignment</h2>
        <p className="hint">Completed, cancelled or archived jobs cannot be reassigned.</p>
      </div>
    );
  }

  const mechanics = options.data ?? [];
  const unchanged = selected === (job.assigned_mechanic_id ?? '');
  const unassigning = selected === '' && job.status === 'in_progress';

  return (
    <div className="panel">
      <h2>Assignment</h2>
      {options.isPending ? <LoadingState label="Loading mechanics…" /> : null}
      {options.isError ? (
        <ErrorState title="Could not load mechanics" error={options.error} onRetry={() => options.refetch()} />
      ) : null}
      {options.data ? (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate(selected === '' ? null : selected);
          }}
        >
          <Field
            label="Assigned mechanic"
            name="mechanic_id"
            value={selected}
            onChange={(event) => setChoice(event.target.value)}
            disabled={mutation.isPending}
            hint={
              job.status === 'in_progress'
                ? 'This job is in progress, so it must keep a mechanic. Pick an available mechanic to hand it over.'
                : 'Off-duty mechanics cannot be assigned.'
            }
          >
            <option value="">Unassigned</option>
            {job.assigned_mechanic_id && !mechanics.some((m) => m.id === job.assigned_mechanic_id) ? (
              <option value={job.assigned_mechanic_id}>Current mechanic</option>
            ) : null}
            {mechanics.map((m) => (
              <option key={m.id} value={m.id} disabled={m.duty_status === 'off_duty' && m.id !== job.assigned_mechanic_id}>
                {m.name} ({m.duty_status.replace('_', ' ')})
              </option>
            ))}
          </Field>
          <ErrorNotice error={mutation.error} />
          <div className="button-row">
            <button type="submit" disabled={mutation.isPending || unchanged || unassigning}>
              {mutation.isPending ? 'Saving…' : 'Save assignment'}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function StatusPanel({ job, onDone }) {
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(null);
  const mutation = useJobMutation(
    job.id,
    ({ to, text }) => transitionJob(job, to, text),
    (_record, variables) => {
      setNote('');
      setConfirming(null);
      onDone(`Job is now ${STATUS_LABELS[variables.to].toLowerCase()}.`);
    },
  );
  const next = job.archived_at ? [] : TRANSITIONS[job.status];

  function run(to) {
    mutation.mutate({ to, text: note.trim() || undefined });
  }

  return (
    <div className="panel">
      <h2>Status</h2>
      {next.length === 0 ? (
        <p className="hint">
          {job.archived_at ? 'This job is archived.' : `This job is ${STATUS_LABELS[job.status].toLowerCase()} and cannot change status.`}
        </p>
      ) : (
        <div className="stack">
          <Field
            label="Note (optional)"
            name="transition_note"
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            disabled={mutation.isPending}
          />
          <div className="button-row">
            {next.map((to) => (
              <button
                key={to}
                type="button"
                className={to === 'cancelled' ? 'danger' : undefined}
                disabled={mutation.isPending}
                onClick={() => (to === 'cancelled' ? setConfirming(to) : run(to))}
              >
                {transitionLabel(job.status, to)}
              </button>
            ))}
          </div>
          {confirming ? (
            <ConfirmPanel
              title="Cancel this job?"
              description="Cancelling is final: the job cannot be reopened. The mechanic is released."
              confirmLabel="Yes, cancel job"
              cancelLabel="Keep job"
              pending={mutation.isPending}
              onConfirm={() => run('cancelled')}
              onCancel={() => setConfirming(null)}
            />
          ) : null}
        </div>
      )}
      <ErrorNotice error={mutation.error} />
    </div>
  );
}

function ArchivePanel({ job, onDone }) {
  const [confirming, setConfirming] = useState(false);
  const mutation = useJobMutation(job.id, () => archiveJob(job), () => {
    setConfirming(false);
    onDone('Job archived.');
  });
  if (job.archived_at || !TERMINAL_STATUSES.includes(job.status)) return null;
  return (
    <div className="panel">
      <h2>Archive</h2>
      <p className="hint">Archived jobs are hidden from lists by default but keep their details and history.</p>
      {confirming ? (
        <ConfirmPanel
          title="Archive this job?"
          description="It will no longer appear in the default job list."
          confirmLabel="Yes, archive job"
          cancelLabel="Keep visible"
          pending={mutation.isPending}
          onConfirm={() => mutation.mutate()}
          onCancel={() => setConfirming(false)}
        />
      ) : (
        <div className="button-row">
          <button type="button" className="danger" onClick={() => setConfirming(true)}>
            Archive job
          </button>
        </div>
      )}
      <ErrorNotice error={mutation.error} />
    </div>
  );
}

function History({ job, page }) {
  const params = { page, page_size: HISTORY_PAGE_SIZE };
  const history = useQuery({
    queryKey: jobKeys.history(job.id, params),
    queryFn: () => getJobHistory(job.id, params),
  });
  return (
    <div className="panel" aria-labelledby="history-title">
      <h2 id="history-title">History</h2>
      {history.isPending ? <LoadingState label="Loading history…" /> : null}
      {history.isError ? (
        <ErrorState title="Could not load history" error={history.error} onRetry={() => history.refetch()} />
      ) : null}
      {history.data ? (
        history.data.data.length === 0 ? (
          <EmptyState>No status changes yet.</EmptyState>
        ) : (
          <>
            <ol className="list">
              {history.data.data.map((event) => (
                <li className="list-item" key={event.id}>
                  <div>
                    <span>
                      {STATUS_LABELS[event.from_status] ?? event.from_status} → {STATUS_LABELS[event.to_status] ?? event.to_status}
                    </span>
                    {event.note ? <span>{event.note}</span> : null}
                    <small><DateTime value={event.created_at} /></small>
                  </div>
                </li>
              ))}
            </ol>
            <Pagination
              page={history.data.page}
              pageSize={history.data.page_size}
              total={history.data.total}
              to={jobPath(job.id)}
              queryForPage={(p) => (p > 1 ? { history_page: p } : {})}
              label="History pagination"
            />
          </>
        )
      ) : null}
    </div>
  );
}

function JobView({ job, historyPage }) {
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState(null);

  function done(message) {
    setEditing(false);
    setNotice(message);
  }

  return (
    <>
      <div className="page-head">
        <h1>
          {job.job_number} <StatusBadge status={job.status} />
          {job.archived_at ? <> <ArchivedBadge /></> : null}
        </h1>
        <Link to="/jobs">Back to jobs</Link>
      </div>
      <SuccessNotice>{notice}</SuccessNotice>
      <div className="panel">
        <div className="page-head">
          <h2>Details</h2>
          {!editing ? (
            <button type="button" className="ghost" onClick={() => { setNotice(null); setEditing(true); }}>
              Edit details
            </button>
          ) : null}
        </div>
        <JobSummary job={job} />
      </div>
      {editing ? <EditPanel job={job} onDone={done} /> : null}
      <StatusPanel job={job} onDone={done} />
      <AssignmentPanel job={job} onDone={done} />
      <History job={job} page={historyPage} />
      <ArchivePanel job={job} onDone={done} />
    </>
  );
}

export default function JobDetail({ id, query = {} }) {
  const job = useJob(id);
  const historyPage = /^\d+$/.test(query.history_page ?? '') && Number(query.history_page) > 0 ? Number(query.history_page) : 1;
  return (
    <section aria-label="Job">
      <QueryBoundary query={job} noun="job">
        {(data) => <JobView job={data} historyPage={historyPage} />}
      </QueryBoundary>
    </section>
  );
}
