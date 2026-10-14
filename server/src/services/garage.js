import { withTransaction } from '../db.js';
import { notFound, preconditionFailed, validationError } from '../errors.js';
import { findGarage, timeZoneExists, updateGarageFields } from '../repos/garages.js';

export async function updateGarage(pool, { garageId, expectedVersion, changes }) {
  return withTransaction(pool, async (db) => {
    const garage = await findGarage(db, garageId, { forUpdate: true });
    if (!garage) {
      throw notFound('Garage not found.');
    }
    if (garage.version !== expectedVersion) {
      throw preconditionFailed();
    }

    if (changes.time_zone !== undefined && !(await timeZoneExists(db, changes.time_zone))) {
      throw validationError([
        { field: 'time_zone', code: 'invalid', message: 'Must be a valid IANA time zone name.' },
      ]);
    }

    const fields = {};
    for (const key of ['name', 'time_zone']) {
      if (Object.hasOwn(changes, key)) {
        fields[key] = changes[key];
      }
    }
    return updateGarageFields(db, garageId, fields);
  });
}
