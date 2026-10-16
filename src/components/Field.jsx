import { useId } from 'react';

export default function Field({ label, error, hint, required, multiline, wide, children, ...inputProps }) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  const shared = {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    'aria-required': required ? true : undefined,
  };

  let control;
  if (children) control = <select {...shared} {...inputProps}>{children}</select>;
  else if (multiline) control = <textarea rows={3} {...shared} {...inputProps} />;
  else control = <input {...shared} {...inputProps} />;

  return (
    <div className={`field${wide ? ' field-wide' : ''}${error ? ' field-invalid' : ''}`}>
      <label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {control}
      {hint ? (
        <small id={hintId} className="hint">
          {hint}
        </small>
      ) : null}
      {error ? (
        <small id={errorId} className="field-error">
          {error}
        </small>
      ) : null}
    </div>
  );
}
