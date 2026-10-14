/** Escape LIKE/ILIKE wildcards so user text is matched literally. */
export function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

export function offsetFor(page, pageSize) {
  return (page - 1) * pageSize;
}

/**
 * Build `col = $n` assignments from a plain object. Column names always come from
 * service-level allowlists, never directly from request input.
 */
export function buildAssignments(fields, firstParam) {
  const columns = Object.keys(fields);
  return {
    sql: columns.map((column, index) => `${column} = $${firstParam + index}`).join(', '),
    values: columns.map((column) => fields[column]),
  };
}

export function orderBy(expressions, direction) {
  const dir = direction === 'asc' ? 'ASC' : 'DESC';
  return [...expressions, 'id'].map((expression) => `${expression} ${dir}`).join(', ');
}
