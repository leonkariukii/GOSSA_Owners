import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import QueryBoundary from '../components/QueryBoundary.jsx';
import RecordForm from '../components/RecordForm.jsx';
import { SuccessNotice } from '../components/States.jsx';
import { isStale } from '../lib/errors.js';
import { GARAGE_FIELDS, recordToValues } from '../lib/forms.js';
import { dashboardKey } from '../lib/services/dashboard.js';
import { sessionKey } from '../lib/services/auth.js';
import { garageKey, getGarage, updateGarage } from '../lib/services/garage.js';

function GarageForm({ garage }) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState(null);
  const mutation = useMutation({
    mutationFn: (changes) => updateGarage(garage, changes),
    onSuccess: (updated) => {
      queryClient.setQueryData(garageKey, updated);
      // Keep the header and date formatting in step with the confirmed values.
      queryClient.setQueryData(sessionKey, (session) =>
        session ? { ...session, garage: { ...session.garage, name: updated.name, time_zone: updated.time_zone } } : session,
      );
      queryClient.invalidateQueries({ queryKey: dashboardKey });
      setNotice('Garage settings saved.');
    },
    onError: (error) => {
      setNotice(null);
      if (isStale(error)) queryClient.invalidateQueries({ queryKey: garageKey });
    },
  });

  return (
    <div className="panel">
      <SuccessNotice>{notice}</SuccessNotice>
      <RecordForm
        mode="edit"
        fields={GARAGE_FIELDS}
        values={recordToValues(garage, GARAGE_FIELDS)}
        version={garage.version}
        pending={mutation.isPending}
        error={mutation.error}
        submitLabel="Save settings"
        onSubmit={(changes) => {
          setNotice(null);
          mutation.mutate(changes);
        }}
      />
    </div>
  );
}

export default function Settings() {
  const garage = useQuery({ queryKey: garageKey, queryFn: getGarage });
  return (
    <section aria-labelledby="settings-title">
      <div className="page-head">
        <h1 id="settings-title">Garage settings</h1>
      </div>
      <QueryBoundary query={garage} noun="garage settings">
        {(data) => <GarageForm garage={data} />}
      </QueryBoundary>
    </section>
  );
}
