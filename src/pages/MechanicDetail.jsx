import { useState } from 'react';
import { ArchivedBadge, DutyBadge } from '../components/Badges.jsx';
import ConfirmPanel from '../components/ConfirmPanel.jsx';
import DateTime from '../components/DateTime.jsx';
import Link from '../components/Link.jsx';
import QueryBoundary from '../components/QueryBoundary.jsx';
import RecordForm from '../components/RecordForm.jsx';
import { ErrorNotice, SuccessNotice } from '../components/States.jsx';
import { useMechanic } from '../hooks/useQueries.js';
import { useMechanicMutation } from '../hooks/useRecordMutation.js';
import { display } from '../lib/format.js';
import { MECHANIC_FIELDS, recordToValues } from '../lib/forms.js';
import {
  archiveMechanic,
  setAvailable,
  setOffDuty,
  updateMechanic,
} from '../lib/services/mechanics.js';

function Detail({ label, children, wide }) {
  return (
    <div className={wide ? 'detail detail-wide' : 'detail'}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function EditPanel({ mechanic, onDone }) {
  const mutation = useMechanicMutation(
    mechanic.id,
    (changes) => updateMechanic(mechanic, changes),
    () => onDone('Mechanic details saved.'),
  );
  return (
    <div className="panel">
      <h2>Edit details</h2>
      <RecordForm
        mode="edit"
        fields={MECHANIC_FIELDS}
        values={recordToValues(mechanic, MECHANIC_FIELDS)}
        version={mechanic.version}
        pending={mutation.isPending}
        error={mutation.error}
        submitLabel="Save changes"
        onSubmit={(changes) => mutation.mutate(changes)}
        onCancel={() => onDone(null)}
      />
    </div>
  );
}

function DutyPanel({ mechanic, onDone }) {
  const mutation = useMechanicMutation(
    mechanic.id,
    (action) => (action === 'off_duty' ? setOffDuty(mechanic) : setAvailable(mechanic)),
    (_record, action) => onDone(action === 'off_duty' ? 'Marked off duty.' : 'Marked available.'),
  );

  let body;
  if (mechanic.archived_at) {
    body = <p className="hint">Archived mechanics cannot change duty status.</p>;
  } else if (mechanic.duty_status === 'busy') {
    body = (
      <p className="hint">
        Working on an in-progress job. Duty status changes automatically when the job is paused,
        completed, cancelled or reassigned.
      </p>
    );
  } else {
    const toOff = mechanic.duty_status === 'available';
    body = (
      <div className="button-row">
        <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate(toOff ? 'off_duty' : 'available')}>
          {mutation.isPending ? 'Saving…' : toOff ? 'Set off duty' : 'Mark available'}
        </button>
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>Duty status</h2>
      {body}
      <ErrorNotice error={mutation.error} />
    </div>
  );
}

function ArchivePanel({ mechanic, onDone }) {
  const [confirming, setConfirming] = useState(false);
  const mutation = useMechanicMutation(mechanic.id, () => archiveMechanic(mechanic), () => {
    setConfirming(false);
    onDone('Mechanic archived.');
  });
  if (mechanic.archived_at) return null;
  return (
    <div className="panel">
      <h2>Archive</h2>
      <p className="hint">
        Archived mechanics are hidden from the roster by default. A mechanic with open, in-progress or
        waiting jobs cannot be archived.
      </p>
      {confirming ? (
        <ConfirmPanel
          title={`Archive ${mechanic.name}?`}
          description="They can no longer be assigned to jobs. Past jobs keep their assignment history."
          confirmLabel="Yes, archive mechanic"
          cancelLabel="Keep on roster"
          pending={mutation.isPending}
          onConfirm={() => mutation.mutate()}
          onCancel={() => setConfirming(false)}
        />
      ) : (
        <div className="button-row">
          <button type="button" className="danger" onClick={() => setConfirming(true)}>
            Archive mechanic
          </button>
        </div>
      )}
      <ErrorNotice error={mutation.error} />
    </div>
  );
}

function MechanicView({ mechanic }) {
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
          {mechanic.name} <DutyBadge status={mechanic.duty_status} />
          {mechanic.archived_at ? <> <ArchivedBadge /></> : null}
        </h1>
        <Link to="/mechanics">Back to mechanics</Link>
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
        <dl className="detail-grid">
          <Detail label="Phone">{display(mechanic.phone)}</Detail>
          <Detail label="Added"><DateTime value={mechanic.created_at} /></Detail>
          <Detail label="Skills" wide>{display(mechanic.skills)}</Detail>
          <Detail label="Last updated"><DateTime value={mechanic.updated_at} /></Detail>
        </dl>
        <p>
          <Link to="/jobs" query={{ mechanic_id: mechanic.id }}>View this mechanic&rsquo;s jobs</Link>
        </p>
      </div>
      {editing ? <EditPanel mechanic={mechanic} onDone={done} /> : null}
      <DutyPanel mechanic={mechanic} onDone={done} />
      <ArchivePanel mechanic={mechanic} onDone={done} />
    </>
  );
}

export default function MechanicDetail({ id }) {
  const mechanic = useMechanic(id);
  return (
    <section aria-label="Mechanic">
      <QueryBoundary query={mechanic} noun="mechanic">
        {(data) => <MechanicView mechanic={data} />}
      </QueryBoundary>
    </section>
  );
}
