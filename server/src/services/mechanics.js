import { withTransaction } from '../db.js';
import { conflict, notFound, preconditionFailed } from '../errors.js';
import {
  archiveMechanic as archiveMechanicRow,
  findMechanic,
  hasInProgressJob,
  hasNonterminalJobs,
  insertMechanic,
  setDutyStatus,
  updateMechanicFields,
} from '../repos/mechanics.js';

const EDITABLE_FIELDS = ['name', 'phone', 'skills'];

/** Lock the mechanic row, then enforce existence (tenant-scoped) and the If-Match version. */
async function lockForMutation(db, garageId, id, expectedVersion) {
  const mechanic = await findMechanic(db, garageId, id, { forUpdate: true });
  if (!mechanic) {
    throw notFound('Mechanic not found.');
  }
  if (mechanic.version !== expectedVersion) {
    throw preconditionFailed();
  }
  return mechanic;
}

export function createMechanic(pool, { garageId, input }) {
  return insertMechanic(pool, garageId, input);
}

export async function updateMechanic(pool, { garageId, id, expectedVersion, changes }) {
  return withTransaction(pool, async (db) => {
    await lockForMutation(db, garageId, id, expectedVersion);
    const fields = {};
    for (const key of EDITABLE_FIELDS) {
      if (Object.hasOwn(changes, key)) {
        fields[key] = changes[key];
      }
    }
    return updateMechanicFields(db, garageId, id, fields);
  });
}

export async function markOffDuty(pool, { garageId, id, expectedVersion }) {
  return withTransaction(pool, async (db) => {
    const mechanic = await lockForMutation(db, garageId, id, expectedVersion);
    if (mechanic.archived_at) {
      throw conflict('CONFLICT', 'An archived mechanic cannot change duty status.');
    }
    if (mechanic.duty_status === 'busy' || (await hasInProgressJob(db, garageId, id))) {
      throw conflict('MECHANIC_HAS_ACTIVE_JOB', 'This mechanic is working an in-progress job.');
    }
    if (mechanic.duty_status === 'off_duty') {
      throw conflict('CONFLICT', 'This mechanic is already off duty.');
    }
    return setDutyStatus(db, garageId, id, 'off_duty');
  });
}

export async function markAvailable(pool, { garageId, id, expectedVersion }) {
  return withTransaction(pool, async (db) => {
    const mechanic = await lockForMutation(db, garageId, id, expectedVersion);
    if (mechanic.duty_status === 'busy' || (await hasInProgressJob(db, garageId, id))) {
      throw conflict('MECHANIC_HAS_ACTIVE_JOB', 'This mechanic is working an in-progress job.');
    }
    if (mechanic.archived_at) {
      throw conflict('CONFLICT', 'An archived mechanic cannot change duty status.');
    }
    if (mechanic.duty_status !== 'off_duty') {
      throw conflict('CONFLICT', 'Only an off-duty mechanic can be marked available.');
    }
    return setDutyStatus(db, garageId, id, 'available');
  });
}

export async function archiveMechanic(pool, { garageId, id, expectedVersion }) {
  return withTransaction(pool, async (db) => {
    const mechanic = await lockForMutation(db, garageId, id, expectedVersion);
    if (mechanic.archived_at) {
      throw conflict('CONFLICT', 'This mechanic is already archived.');
    }
    if (await hasNonterminalJobs(db, garageId, id)) {
      throw conflict(
        'MECHANIC_HAS_NONTERMINAL_JOBS',
        'This mechanic is assigned to open, in-progress or waiting jobs.',
      );
    }
    return archiveMechanicRow(db, garageId, id);
  });
}
