import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createJobViaApi,
  createMechanicViaApi,
  createTestContext,
  expectError,
  login,
  resetDatabase,
  seedGarage,
  seedJob,
  seedMechanic,
} from './helpers.js';

const ctx = createTestContext();
let owner;
let foreign;

// The second garage and its records are created directly in the disposable database:
// there is deliberately no API for provisioning a garage.
beforeEach(async () => {
  await resetDatabase(ctx.pool);
  await seedGarage(ctx.pool);
  const other = await seedGarage(ctx.pool, { name: 'Other Garage', email: 'other@example.com' });
  const mechanic = await seedMechanic(ctx.pool, other.garageId, { name: 'Foreign Mechanic' });
  const job = await seedJob(ctx.pool, other.garageId, other.userId, {
    registration: 'KDA 123A',
    customerName: 'Foreign Customer',
    jobNumber: 'JC-2026-001',
  });
  const busy = await seedMechanic(ctx.pool, other.garageId, { name: 'Foreign Busy' });
  foreign = { ...other, mechanic, job, busy };
  owner = await login(ctx.app);
});

afterAll(() => ctx.pool.end());

describe('tenant isolation', () => {
  it('returns 404 for foreign mechanics and jobs exactly as for nonexistent ones', async () => {
    const shapes = [];
    for (const id of [foreign.mechanic.id, 'mech_does_not_exist']) {
      const responses = [
        await owner.get(`/mechanics/${id}`),
        await owner.patch(`/mechanics/${id}`, { name: 'Hijack' }, 1),
        await owner.post(`/mechanics/${id}/off-duty`, undefined, 1),
        await owner.post(`/mechanics/${id}/available`, undefined, 1),
        await owner.post(`/mechanics/${id}/archive`, undefined, 1),
      ];
      for (const response of responses) {
        expectError(response, 404, 'NOT_FOUND');
        shapes.push(response.body.error.message);
      }
    }
    for (const id of [foreign.job.id, 'job_does_not_exist']) {
      const responses = [
        await owner.get(`/jobs/${id}`),
        await owner.get(`/jobs/${id}/history`),
        await owner.patch(`/jobs/${id}`, { diagnosis: 'Hijack' }, 1),
        await owner.post(`/jobs/${id}/assignment`, { mechanic_id: null }, 1),
        await owner.post(`/jobs/${id}/transitions`, { to_status: 'cancelled' }, 1),
        await owner.post(`/jobs/${id}/archive`, undefined, 1),
      ];
      for (const response of responses) {
        expectError(response, 404, 'NOT_FOUND');
        shapes.push(response.body.error.message);
      }
    }
    // Real and made-up identifiers produce identical messages.
    const half = shapes.length / 2;
    expect(new Set(shapes).size).toBeLessThanOrEqual(2);
    expect(half).toBeGreaterThan(0);
  });

  it('never lists, counts or searches foreign records', async () => {
    const mine = await createMechanicViaApi(owner, { name: 'Mine' });
    const job = await createJobViaApi(owner, { vehicle_registration: 'MINE 1A' });

    expect((await owner.get('/mechanics')).body.data.map((m) => m.id)).toEqual([mine.id]);
    expect((await owner.get('/mechanics?q=Foreign')).body.total).toBe(0);
    expect((await owner.get('/jobs')).body.data.map((j) => j.id)).toEqual([job.id]);
    expect((await owner.get('/jobs?q=Foreign')).body.total).toBe(0);
    expect((await owner.get('/jobs?q=KDA123A')).body.total).toBe(0);
    expect((await owner.get(`/jobs?mechanic_id=${foreign.mechanic.id}`)).body.total).toBe(0);

    const dashboard = (await owner.get('/dashboard')).body.data;
    expect(dashboard.open_count).toBe(1);
    expect(dashboard.recent_jobs.map((j) => j.id)).toEqual([job.id]);
  });

  it('treats a foreign mechanic as an unknown mechanic_id', async () => {
    const job = await createJobViaApi(owner);
    const response = await owner.post(`/jobs/${job.id}/assignment`, { mechanic_id: foreign.mechanic.id }, job.version);
    expectError(response, 422, 'VALIDATION_ERROR');
    expect(response.body.error.details[0].field).toBe('mechanic_id');
    expect(JSON.stringify(response.body)).not.toContain('Foreign');
  });

  it('allows the same registration and job number in different garages', async () => {
    const mine = await createJobViaApi(owner, { vehicle_registration: 'KDA 123A' });
    expect(mine.job_number).toMatch(/^JC-\d{4}-001$/);
  });

  it('leaves foreign records untouched after attempted cross-tenant writes', async () => {
    await owner.patch(`/jobs/${foreign.job.id}`, { diagnosis: 'Hijack' }, 1);
    await owner.post(`/mechanics/${foreign.mechanic.id}/archive`, undefined, 1);

    const job = await ctx.pool.query('SELECT version, diagnosis, status FROM jobs WHERE id = $1', [foreign.job.id]);
    expect(job.rows[0]).toEqual({ version: 1, diagnosis: null, status: 'open' });
    const mechanic = await ctx.pool.query('SELECT version, archived_at FROM mechanics WHERE id = $1', [foreign.mechanic.id]);
    expect(mechanic.rows[0]).toEqual({ version: 1, archived_at: null });
  });

  it('refuses at the database level to assign a job to another garage’s mechanic', async () => {
    const job = await createJobViaApi(owner);
    await expect(
      ctx.pool.query('UPDATE jobs SET assigned_mechanic_id = $1 WHERE id = $2', [foreign.mechanic.id, job.id]),
    ).rejects.toThrow();
  });

  it('scopes sessions to their own garage', async () => {
    const other = await login(ctx.app, 'other@example.com');
    const me = await other.get('/auth/me').expect(200);
    expect(me.body.data.garage.name).toBe('Other Garage');

    const job = await other.get(`/jobs/${foreign.job.id}`).expect(200);
    expect(job.body.data.customer_name).toBe('Foreign Customer');
    expectError(await other.get(`/mechanics/${(await createMechanicViaApi(owner)).id}`), 404, 'NOT_FOUND');
  });
});
