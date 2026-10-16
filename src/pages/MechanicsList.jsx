import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ArchivedBadge, DutyBadge } from '../components/Badges.jsx';
import Field from '../components/Field.jsx';
import Link from '../components/Link.jsx';
import Pagination from '../components/Pagination.jsx';
import RecordForm from '../components/RecordForm.jsx';
import { EmptyState, ErrorState, LoadingState, SuccessNotice } from '../components/States.jsx';
import { DUTY_LABELS, DUTY_STATUSES, MECHANIC_SORTS } from '../lib/constants.js';
import { display } from '../lib/format.js';
import { MECHANIC_FIELDS, emptyValues } from '../lib/forms.js';
import { MECHANIC_DEFAULTS, readMechanicListState, toApiParams, toHashQuery } from '../lib/listState.js';
import { applyMechanicUpdate } from '../lib/cache.js';
import { buildHash, mechanicPath, navigate } from '../lib/router.js';
import { createMechanic, listMechanics, mechanicKeys } from '../lib/services/mechanics.js';

const EMPTY = emptyValues(MECHANIC_FIELDS);

function Filters({ state }) {
  function handleSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = readMechanicListState({
      q: form.get('q'),
      duty_status: form.get('duty_status'),
      include_archived: form.get('include_archived') ? 'true' : 'false',
      sort_by: form.get('sort_by'),
      order: form.get('order'),
      page_size: String(state.page_size),
    });
    navigate(buildHash('/mechanics', toHashQuery(next, MECHANIC_DEFAULTS)));
  }

  return (
    <form className="panel filters" onSubmit={handleSubmit} role="search" aria-label="Filter mechanics">
      <div className="field-grid">
        <Field label="Search" name="q" type="search" defaultValue={state.q} maxLength={120} hint="Name or phone" />
        <Field label="Duty status" name="duty_status" defaultValue={state.duty_status}>
          <option value="">Any status</option>
          {DUTY_STATUSES.map((s) => (
            <option key={s} value={s}>{DUTY_LABELS[s]}</option>
          ))}
        </Field>
        <Field label="Sort by" name="sort_by" defaultValue={state.sort_by}>
          {MECHANIC_SORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </Field>
        <Field label="Order" name="order" defaultValue={state.order}>
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
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
        <Link to="/mechanics" className="button ghost">Reset</Link>
      </div>
    </form>
  );
}

function CreatePanel({ onCreated, onCancel }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: createMechanic,
    onSuccess: (mechanic) => {
      applyMechanicUpdate(queryClient, mechanic);
      onCreated(mechanic);
    },
  });
  return (
    <div className="panel">
      <h2>Add mechanic</h2>
      <RecordForm
        mode="create"
        fields={MECHANIC_FIELDS}
        values={EMPTY}
        pending={mutation.isPending}
        error={mutation.error}
        submitLabel="Save mechanic"
        onSubmit={(payload) => mutation.mutate(payload)}
        onCancel={onCancel}
      />
    </div>
  );
}

export default function MechanicsList({ query }) {
  const state = readMechanicListState(query);
  const params = toApiParams(state);
  const mechanics = useQuery({ queryKey: mechanicKeys.list(params), queryFn: () => listMechanics(params) });
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState(null);
  const queryForPage = (page) => toHashQuery({ ...state, page }, MECHANIC_DEFAULTS);
  const formKey = buildHash('/mechanics', toHashQuery(state, MECHANIC_DEFAULTS));

  return (
    <section aria-labelledby="mechanics-title">
      <div className="page-head">
        <h1 id="mechanics-title">Mechanics</h1>
        {!creating ? (
          <button type="button" onClick={() => { setNotice(null); setCreating(true); }}>
            Add mechanic
          </button>
        ) : null}
      </div>
      <SuccessNotice>{notice}</SuccessNotice>
      {creating ? (
        <CreatePanel
          onCancel={() => setCreating(false)}
          onCreated={(mechanic) => {
            setCreating(false);
            setNotice(`${mechanic.name} was added to the roster.`);
          }}
        />
      ) : null}
      <Filters key={formKey} state={state} />
      {mechanics.isPending ? <LoadingState label="Loading mechanics…" /> : null}
      {mechanics.isError ? (
        <ErrorState title="Could not load mechanics" error={mechanics.error} onRetry={() => mechanics.refetch()} />
      ) : null}
      {mechanics.data ? (
        <div className="panel" aria-busy={mechanics.isFetching}>
          {mechanics.data.data.length === 0 ? (
            <EmptyState>
              No mechanics match these filters.{' '}
              {state.page > 1 ? <Link to="/mechanics" query={queryForPage(1)}>Go to the first page</Link> : null}
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Status</th>
                    <th scope="col">Phone</th>
                    <th scope="col">Skills</th>
                  </tr>
                </thead>
                <tbody>
                  {mechanics.data.data.map((mechanic) => (
                    <tr key={mechanic.id}>
                      <td><Link to={mechanicPath(mechanic.id)}>{mechanic.name}</Link></td>
                      <td>
                        <DutyBadge status={mechanic.duty_status} />
                        {mechanic.archived_at ? <> <ArchivedBadge /></> : null}
                      </td>
                      <td>{display(mechanic.phone)}</td>
                      <td>{display(mechanic.skills)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={mechanics.data.page}
            pageSize={mechanics.data.page_size}
            total={mechanics.data.total}
            to="/mechanics"
            queryForPage={queryForPage}
            label="Mechanics pagination"
          />
        </div>
      ) : null}
    </section>
  );
}
