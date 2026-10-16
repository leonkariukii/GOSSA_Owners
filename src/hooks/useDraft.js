import { useState } from 'react';

/**
 * Editable copy of a record's string values. When the record's version changes
 * (e.g. after a refetch following a 412), fields the user has not touched follow
 * the latest server values; fields the user edited keep their draft.
 */
export function useDraft(source, version) {
  const [state, setState] = useState({ values: source, base: source, version });
  let current = state;
  if (state.version !== version) {
    const values = {};
    for (const key of Object.keys(source)) {
      values[key] = state.values[key] === state.base[key] ? source[key] : state.values[key];
    }
    current = { values, base: source, version };
    setState(current);
  }
  const setField = (name, value) =>
    setState((s) => ({ ...s, values: { ...s.values, [name]: value } }));
  return { values: current.values, base: current.base, setField };
}
