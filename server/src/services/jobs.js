import { withTransaction } from '../db.js';
import { conflict, notFound, preconditionFailed, validationError } from '../errors.js';
import { normalizeRegistration } from '../domain/registration.js';
import { ASSIGNABLE_STATUSES, canTransition, isTerminal } from '../domain/transitions.js';
import { currentYearIn, findGarage } from '../repos/garages.js';
import {
  archiveJob as archiveJobRow,
  findJob,
  insertHistory,
  insertJob,
  nextJobSequence,
  setJobAssignment,
  setJobStatus,
  updateJobFields,
} from '../repos/jobs.js';
import { lockMechanics, setDutyStatus } from '../repos/mechanics.js';

const EDITABLE_FIELDS = [
  'customer_name',
  'customer_phone',
  'vehicle_registration',
  'vehicle_make',
  'vehicle_model',
  'vehicle_year',
  'odometer_km',
  'work_requested',
  'diagnosis',
  'work_performed',
  'internal_notes',
];

/** Lock the job row, then enforce existence (tenant-scoped) and the If-Match version. */
async function lockForMutation(db, garageId, jobId, expectedVersion) {
  const job = await findJob(db, garageId, jobId, { forUpdate: true });
  if (!job) {
    throw notFound('Job not found.');
  }
  if (job.version !== expectedVersion) {
    throw preconditionFailed();
  }
  return job;
}

export async function createJob(pool, { garageId, userId, input }) {
  return withTransaction(pool, async (db) => {
    const garage = await findGarage(db, garageId);
    const year = await currentYearIn(db, garage.time_zone);
    const sequence = await nextJobSequence(db, garageId, year);
    const jobNumber = `JC-${year}-${String(sequence).padStart(3, '0')}`;
    // A duplicate active registration violates uq_jobs_active_vehicle; the whole
    // transaction (including the sequence number) rolls back and the error handler
    // maps it to 409 DUPLICATE_ACTIVE_VEHICLE_JOB.
    return insertJob(db, { garageId, userId, jobNumber, input });
  });
}

export async function updateJob(pool, { garageId, jobId, expectedVersion, changes }) {
  return withTransaction(pool, async (db) => {
    await lockForMutation(db, garageId, jobId, expectedVersion);

    const fields = {};
    for (const key of EDITABLE_FIELDS) {
      if (Object.hasOwn(changes, key)) {
        fields[key] = changes[key];
      }
    }
    if (fields.vehicle_registration !== undefined) {
      fields.normalized_vehicle_registration = normalizeRegistration(fields.vehicle_registration);
    }
    return updateJobFields(db, garageId, jobId, fields);
  });
}

export async function assignMechanic(pool, { garageId, jobId, expectedVersion, mechanicId }) {
  return withTransaction(pool, async (db) => {
    const job = await lockForMutation(db, garageId, jobId, expectedVersion);

    if (job.archived_at || !ASSIGNABLE_STATUSES.includes(job.status)) {
      throw conflict('CONFLICT', 'Completed, cancelled or archived jobs cannot be assigned or unassigned.');
    }

    const currentId = job.assigned_mechanic_id;
    if (mechanicId === currentId) {
      return job;
    }
    if (mechanicId === null && job.status === 'in_progress') {
      throw conflict('ACTIVE_JOB_CANNOT_BE_UNASSIGNED', 'An in-progress job must keep its assigned mechanic.');
    }

    // Locks are taken job first, then mechanics in id order, everywhere in the service layer.
    const locked = await lockMechanics(db, garageId, [currentId, mechanicId]);

    let target = null;
    if (mechanicId !== null) {
      target = locked.get(mechanicId);
      if (!target || target.archived_at) {
        throw validationError([
          { field: 'mechanic_id', code: 'invalid', message: 'Must be the ID of an active mechanic.' },
        ]);
      }
      if (target.duty_status === 'off_duty') {
        throw conflict('MECHANIC_UNAVAILABLE', 'This mechanic is off duty and cannot be assigned work.');
      }
      if (job.status === 'in_progress' && target.duty_status === 'busy') {
        throw conflict('MECHANIC_OCCUPIED', 'This mechanic is already assigned to an active job.');
      }
    }

    if (job.status === 'in_progress') {
      const previous = currentId ? locked.get(currentId) : null;
      if (previous && previous.duty_status === 'busy') {
        await setDutyStatus(db, garageId, previous.id, 'available');
      }
      if (target) {
        await setDutyStatus(db, garageId, target.id, 'busy');
      }
    }

    return setJobAssignment(db, garageId, jobId, mechanicId);
  });
}

export async function transitionJob(pool, { garageId, userId, jobId, expectedVersion, toStatus, note }) {
  return withTransaction(pool, async (db) => {
    const job = await lockForMutation(db, garageId, jobId, expectedVersion);

    if (!canTransition(job.status, toStatus)) {
      throw conflict('INVALID_STATUS_TRANSITION', `A ${job.status} job cannot move to ${toStatus}.`);
    }

    const locked = await lockMechanics(db, garageId, [job.assigned_mechanic_id]);
    const mechanic = job.assigned_mechanic_id ? locked.get(job.assigned_mechanic_id) : null;

    if (toStatus === 'in_progress') {
      if (!mechanic || mechanic.archived_at || mechanic.duty_status === 'off_duty') {
        throw conflict(
          'MECHANIC_UNAVAILABLE',
          'Assign an available mechanic before starting work on this job.',
        );
      }
      if (mechanic.duty_status === 'busy') {
        throw conflict('MECHANIC_OCCUPIED', 'This mechanic is already assigned to an active job.');
      }
      await setDutyStatus(db, garageId, mechanic.id, 'busy');
    } else if (job.status === 'in_progress' && mechanic && mechanic.duty_status === 'busy') {
      await setDutyStatus(db, garageId, mechanic.id, 'available');
    }

    const updated = await setJobStatus(db, garageId, jobId, toStatus);
    await insertHistory(db, {
      garageId,
      jobId,
      actorUserId: userId,
      fromStatus: job.status,
      toStatus,
      note,
    });
    return updated;
  });
}

export async function archiveJob(pool, { garageId, jobId, expectedVersion }) {
  return withTransaction(pool, async (db) => {
    const job = await lockForMutation(db, garageId, jobId, expectedVersion);
    if (job.archived_at) {
      throw conflict('CONFLICT', 'This job is already archived.');
    }
    if (!isTerminal(job.status)) {
      throw conflict('CONFLICT', 'Only completed or cancelled jobs can be archived.');
    }
    return archiveJobRow(db, garageId, jobId);
  });
}
