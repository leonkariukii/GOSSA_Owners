import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createJobViaApi,
  createMechanicViaApi,
  createTestContext,
  expectError,
  login,
  resetDatabase,
  seedGarage,
} from './helpers.js';

const ctx = createTestContext();
let owner;

beforeEach(async () => {
  await resetDatabase(ctx.pool);
  await seedGarage(ctx.pool);
  owner = await login(ctx.app);
});

afterAll(() => ctx.pool.end());

describe('mechanic roster', () => {
  it('creates a mechanic that starts available, with Location and ETag', async () => {
    const response = await owner
      .post('/mechanics', { name: '  Alex Mechanic ', phone: '+254 700 000 000', skills: 'Diagnostics, brakes' })
      .expect(201);

    expect(response.headers.location).toBe(`/api/v1/mechanics/${response.body.data.id}`);
    expect(response.headers.etag).toBe('"v1"');
    expect(response.body.data).toMatchObject({
      name: 'Alex Mechanic',
      phone: '+254 700 000 000',
      skills: 'Diagnostics, brakes',
      duty_status: 'available',
      version: 1,
      archived_at: null,
    });
    expect(response.body.data.garage_id).toBeTruthy();
  });

  it('validates input and never accepts server-owned fields', async () => {
    expectError(await owner.post('/mechanics', {}), 422, 'VALIDATION_ERROR');
    expectError(await owner.post('/mechanics', { name: '   ' }), 422, 'VALIDATION_ERROR');

    const tooLong = await owner.post('/mechanics', { name: 'x'.repeat(121) });
    expectError(tooLong, 422, 'VALIDATION_ERROR');
    expect(tooLong.body.error.details[0]).toEqual({
      field: 'name',
      code: 'too_long',
      message: 'Must be 120 characters or fewer.',
    });

    const badPhone = await owner.post('/mechanics', { name: 'Ok', phone: 'call me maybe' });
    expect(badPhone.body.error.details[0].field).toBe('phone');

    for (const forbidden of [{ garage_id: 'garage_x' }, { duty_status: 'busy' }, { version: 9 }, { id: 'mine' }]) {
      const response = await owner.post('/mechanics', { name: 'Ok', ...forbidden });
      expectError(response, 422, 'VALIDATION_ERROR');
      expect(response.body.error.details[0].code).toBe('unknown_field');
    }
  });

  it('rejects malformed JSON with 400', async () => {
    const response = await owner.agent
      .post('/api/v1/mechanics')
      .set('X-CSRF-Token', owner.csrf)
      .set('Content-Type', 'application/json')
      .send('{"name": ');
    expectError(response, 400, 'BAD_REQUEST');
  });

  it('lists with search, filters, sorting and pagination', async () => {
    await createMechanicViaApi(owner, { name: 'Charlie', phone: '0711000111' });
    await createMechanicViaApi(owner, { name: 'alice', phone: '0722000222' });
    const bob = await createMechanicViaApi(owner, { name: 'Bob' });
    await owner.post(`/mechanics/${bob.id}/off-duty`, undefined, bob.version).expect(200);

    const byName = await owner.get('/mechanics?sort_by=name&order=asc').expect(200);
    expect(byName.body.data.map((m) => m.name)).toEqual(['alice', 'Bob', 'Charlie']);
    expect(byName.body).toMatchObject({ page: 1, page_size: 25, total: 3 });

    const paged = await owner.get('/mechanics?sort_by=name&order=asc&page=2&page_size=2').expect(200);
    expect(paged.body.data.map((m) => m.name)).toEqual(['Charlie']);
    expect(paged.body.total).toBe(3);

    expect((await owner.get('/mechanics?q=0722')).body.data.map((m) => m.name)).toEqual(['alice']);
    expect((await owner.get('/mechanics?q=ALI')).body.data).toHaveLength(1);
    expect((await owner.get('/mechanics?duty_status=off_duty')).body.data.map((m) => m.name)).toEqual(['Bob']);
    expect((await owner.get('/mechanics?q=%25')).body.data).toHaveLength(0);
  });

  it('rejects unsupported sort keys, directions, filters and parameters', async () => {
    for (const query of [
      'sort_by=password',
      'order=sideways',
      'page=0',
      'page_size=101',
      'duty_status=sleeping',
      'include_archived=yes',
      'unexpected=1',
      'q=',
    ]) {
      expectError(await owner.get(`/mechanics?${query}`), 422, 'VALIDATION_ERROR');
    }
  });

  it('updates under If-Match: partial updates, null clears, 428 and 412', async () => {
    const mechanic = await createMechanicViaApi(owner, { name: 'Alex', phone: '0700000000', skills: 'Brakes' });

    expectError(await owner.patch(`/mechanics/${mechanic.id}`, { name: 'No header' }), 428, 'PRECONDITION_REQUIRED');

    const updated = await owner
      .patch(`/mechanics/${mechanic.id}`, { name: 'Alex M.', skills: null }, mechanic.version)
      .expect(200);
    expect(updated.body.data).toMatchObject({ name: 'Alex M.', phone: '0700000000', skills: null, version: 2 });
    expect(updated.headers.etag).toBe('"v2"');

    expectError(await owner.patch(`/mechanics/${mechanic.id}`, { name: 'Stale' }, 1), 412, 'PRECONDITION_FAILED');
    expectError(await owner.patch(`/mechanics/${mechanic.id}`, { name: null }, 2), 422, 'VALIDATION_ERROR');
    expectError(await owner.patch(`/mechanics/${mechanic.id}`, {}, 2), 422, 'VALIDATION_ERROR');
    expectError(await owner.patch(`/mechanics/${mechanic.id}`, { duty_status: 'busy' }, 2), 422, 'VALIDATION_ERROR');
    expectError(await owner.patch(`/mechanics/${mechanic.id}`, { name: 'x' }, 'abc'), 400, 'BAD_REQUEST');

    const after = await owner.get(`/mechanics/${mechanic.id}`).expect(200);
    expect(after.body.data).toMatchObject({ name: 'Alex M.', version: 2 });
  });

  it('returns 404 for unknown mechanics on every route', async () => {
    expectError(await owner.get('/mechanics/nope'), 404, 'NOT_FOUND');
    expectError(await owner.patch('/mechanics/nope', { name: 'x' }, 1), 404, 'NOT_FOUND');
    expectError(await owner.post('/mechanics/nope/off-duty', undefined, 1), 404, 'NOT_FOUND');
    expectError(await owner.post('/mechanics/nope/available', undefined, 1), 404, 'NOT_FOUND');
    expectError(await owner.post('/mechanics/nope/archive', undefined, 1), 404, 'NOT_FOUND');
  });

  it('toggles off duty and available, bumping the version each time', async () => {
    const mechanic = await createMechanicViaApi(owner);

    expectError(await owner.post(`/mechanics/${mechanic.id}/off-duty`), 428, 'PRECONDITION_REQUIRED');
    expectError(await owner.post(`/mechanics/${mechanic.id}/available`, undefined, 1), 409, 'CONFLICT');

    const off = await owner.post(`/mechanics/${mechanic.id}/off-duty`, undefined, 1).expect(200);
    expect(off.body.data).toMatchObject({ duty_status: 'off_duty', version: 2 });

    expectError(await owner.post(`/mechanics/${mechanic.id}/off-duty`, undefined, 2), 409, 'CONFLICT');
    expectError(await owner.post(`/mechanics/${mechanic.id}/off-duty`, undefined, 1), 412, 'PRECONDITION_FAILED');

    const back = await owner.post(`/mechanics/${mechanic.id}/available`, undefined, 2).expect(200);
    expect(back.body.data).toMatchObject({ duty_status: 'available', version: 3 });
  });

  it('keeps a working mechanic from being set off duty or available', async () => {
    const mechanic = await createMechanicViaApi(owner);
    const job = await createJobViaApi(owner);
    const assigned = await owner.post(`/jobs/${job.id}/assignment`, { mechanic_id: mechanic.id }, job.version).expect(200);
    await owner.post(`/jobs/${job.id}/transitions`, { to_status: 'in_progress' }, assigned.body.data.version).expect(200);

    const busy = (await owner.get(`/mechanics/${mechanic.id}`)).body.data;
    expect(busy.duty_status).toBe('busy');

    expectError(await owner.post(`/mechanics/${mechanic.id}/off-duty`, undefined, busy.version), 409, 'MECHANIC_HAS_ACTIVE_JOB');
    expectError(await owner.post(`/mechanics/${mechanic.id}/available`, undefined, busy.version), 409, 'MECHANIC_HAS_ACTIVE_JOB');
    expectError(await owner.post(`/mechanics/${mechanic.id}/archive`, undefined, busy.version), 409, 'MECHANIC_HAS_NONTERMINAL_JOBS');
  });

  it('archives a mechanic only when they have no open, in-progress or waiting jobs', async () => {
    const mechanic = await createMechanicViaApi(owner, { name: 'Archive Me' });
    const job = await createJobViaApi(owner);
    const assigned = await owner.post(`/jobs/${job.id}/assignment`, { mechanic_id: mechanic.id }, job.version).expect(200);

    expectError(await owner.post(`/mechanics/${mechanic.id}/archive`, undefined, 1), 409, 'MECHANIC_HAS_NONTERMINAL_JOBS');

    await owner.post(`/jobs/${job.id}/transitions`, { to_status: 'cancelled' }, assigned.body.data.version).expect(200);
    const archived = await owner.post(`/mechanics/${mechanic.id}/archive`, undefined, 1).expect(200);
    expect(archived.body.data.archived_at).not.toBeNull();
    expect(archived.body.data.version).toBe(2);

    expectError(await owner.post(`/mechanics/${mechanic.id}/archive`, undefined, 2), 409, 'CONFLICT');
  });

  it('hides archived mechanics from lists by default but keeps them readable by id', async () => {
    const mechanic = await createMechanicViaApi(owner, { name: 'Gone' });
    await createMechanicViaApi(owner, { name: 'Stays' });
    await owner.post(`/mechanics/${mechanic.id}/archive`, undefined, 1).expect(200);

    expect((await owner.get('/mechanics')).body.data.map((m) => m.name)).toEqual(['Stays']);
    const all = await owner.get('/mechanics?include_archived=true').expect(200);
    expect(all.body.total).toBe(2);
    await owner.get(`/mechanics/${mechanic.id}`).expect(200);
  });
});
