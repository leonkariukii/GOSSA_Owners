import { useEffect, useId, useRef } from 'react';

/** Inline (non-modal) confirmation; avoids window.confirm and <dialog>.showModal. */
export default function ConfirmPanel({ title, description, confirmLabel, cancelLabel, onConfirm, onCancel, pending }) {
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div
      className="confirm-panel"
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
    >
      <strong id={titleId}>{title}</strong>
      <p id={descId}>{description}</p>
      <div className="button-row">
        <button type="button" className="danger" onClick={onConfirm} disabled={pending}>
          {confirmLabel}
        </button>
        <button type="button" className="ghost" ref={cancelRef} onClick={onCancel} disabled={pending}>
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
