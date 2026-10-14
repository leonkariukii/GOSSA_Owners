import { useState } from 'react';
import { useDraft } from '../hooks/useDraft.js';
import { fieldErrors } from '../lib/errors.js';
import { createPayload, diffPayload, validateValues } from '../lib/forms.js';
import Field from './Field.jsx';
import { ErrorNotice } from './States.jsx';

/**
 * Generic create/edit form. `values` are the record's string values and `version`
 * its version. In edit mode only changed fields are submitted.
 */
export default function RecordForm({
  fields,
  values: source,
  version,
  mode,
  pending,
  error,
  submitLabel,
  onSubmit,
  onCancel,
}) {
  const draft = useDraft(source, version);
  const [clientErrors, setClientErrors] = useState({});
  const [noChanges, setNoChanges] = useState(false);
  const serverErrors = fieldErrors(error);
  const shown = fields.map((f) => f.name);

  function handleSubmit(event) {
    event.preventDefault();
    setNoChanges(false);
    const errors = validateValues(draft.values, fields);
    setClientErrors(errors);
    if (Object.keys(errors).length > 0) return;
    if (mode === 'edit') {
      const changes = diffPayload(draft.values, draft.base, fields);
      if (Object.keys(changes).length === 0) {
        setNoChanges(true);
        return;
      }
      onSubmit(changes);
    } else {
      onSubmit(createPayload(draft.values, fields));
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit} noValidate aria-busy={pending}>
      <div className="field-grid">
        {fields.map((field) => (
          <Field
            key={field.name}
            label={field.label}
            required={field.required}
            multiline={field.multiline}
            wide={field.wide}
            type={field.multiline ? undefined : (field.inputType ?? 'text')}
            inputMode={field.kind === 'int' ? 'numeric' : undefined}
            name={field.name}
            value={draft.values[field.name]}
            onChange={(event) => draft.setField(field.name, event.target.value)}
            error={clientErrors[field.name] ?? serverErrors[field.name]}
            disabled={pending}
          />
        ))}
      </div>
      <ErrorNotice error={error} shownFields={shown} />
      {noChanges ? (
        <p className="notice" role="status">
          No changes to save.
        </p>
      ) : null}
      <div className="button-row">
        <button type="submit" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </button>
        {onCancel ? (
          <button type="button" className="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
