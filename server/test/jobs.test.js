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

const transition = (job, to_status, note) =>
  owner.post(`/jobs/${job.id}/transitions`, note === undefined ? { to_status } : { to_status, note }, job.version);

const assign = (job, mechanic) =>
  owner.post(`/jobs/${job.id}/assignment`, { mechanic_id: mechanic?.id ?? null }, job.version);

async function startedJob(mechanic) {
  const job = await createJobViaApi(owner);
  const assigned = await assign(job, mechanic).expect(200);
  return (await transition(assigned.body.data, 'in_progress').expect(200)).body.data;
}

describe('job creation', () => {
  it('creates an open, unassigned job with a server-generated number', async () => {
    const response = await owner
      .post('/jobs', {
        customer_name: '  Sam Example ',
        customer_phone: '+254 700 000 000',
        vehicle_registration: ' kda 123a ',
        vehicle_make: 'Toyota',
        vehicle_model: 'Corolla',
        vehicle_year: 2020,
        odometer_km: 85000,
        work_requested: 'Inspect front brakes',
        internal_notes: 'Call before extra work',
      })
      .expect(201);

    const year = new Date().getUTCFullYear();
    expect(response.headers.location).toBe(`/api/v1/jobs/${response.body.data.id}`);
    expect(response.headers.etag).toBe('"v1"');
    expect(response.body.data).toMatchObject({
      job_number: `JC-${year}-001`,
      status: 'open',
      customer_name: 'Sam Example',
      vehicle_registration: 'kda 123a',
      vehicle_year: 2020,
      odometer_km: 85000,
      diagnosis: null,
      work_performed: null,
      assigned_mechanic_id: null,
      version: 1,
      archived_at: null,
    });
    expect(response.body.data.created_by_user_id).toBeTruthy();
    expect(Object.keys(response.body.data).some((key) => /price|cost|amount|invoice/i.test(key))).toBe(false);
  });

  it('numbers jobs sequentially per garage', async () => {
    const first = await createJobViaApi(owner);
    const second = await createJobViaApi(owner);
    const year = new Date().getUTCFullYear();
    expect(first.job_number).toBe(`JC-${year}-001`);
    expect(second.job_number).toBe(`JC-${year}-002`);
  });

  it('assigns unique numbers to concurrent creations', async () => {
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        owner.post('/jobs', {
          customer_name: 'Parallel',
          vehicle_registration: `PAR ${index}`,
          work_requested: 'Check',
        }),
      ),
    );
    expect(responses.map((response) => response.status)).toEqual(Array(6).fill(201));
    const numbers = responses.map((response) => response.body.data.job_number);
    expect(new Set(numbers).size).toBe(6);
  });

  it('validates required fields, limits and unknown fields', async () => {
    const valid = { customer_name: 'Sam', vehicle_registration: 'KDA 1A', work_requested: 'Check' };

    expectError(await owner.post('/jobs', {}), 422, 'VALIDATION_ERROR');
    for (const patch of [
      { customer_name: '' },
      { customer_name: 'x'.repeat(161) },
      { vehicle_registration: '---' },
      { vehicle_registration: 'x'.repeat(33) },
      { work_requested: 'y'.repeat(4001) },
      { vehicle_year: 1885 },
      { vehicle_year: new Date().getUTCFullYear() + 2 },
      { vehicle_year: 2020.5 },
      { odometer_km: -1 },
      { odometer_km: '100' },
      { customer_phone: 'abc' },
    ]) {
      expectError(await owner.post('/jobs', { ...valid, ...patch }), 422, 'VALIDATION_ERROR');
    }

    for (const forbidden of [
      { garage_id: 'x' },
      { job_number: 'JC-1' },
      { status: 'completed' },
      { version: 5 },
      { created_by_user_id: 'x' },
      { created_at: '2020-01-01T00:00:00Z' },
      { assigned_mechanic_id: 'x' },
      { price: 10 },
    ]) {
      const response = await owner.post('/jobs', { ...valid, ...forbidden });
      expectError(response, 422, 'VALIDATION_ERROR');
      expect(response.body.error.details[0].code).toBe('unknown_field');
    }
  });

  it('rejects an active job for the same normalized registration but allows it once finished', async () => {
    const first = await createJobViaApi(owner, { vehicle_registration: 'KDA 123A' });

    for (const registration of ['kda123a', ' K-D-A 123 a ', 'KDA.123A']) {
      expectError(
        await owner.post('/jobs', { customer_name: 'Other', vehicle_registration: registration, work_requested: 'Check' }),
        409,
        'DUPLICATE_ACTIVE_VEHICLE_JOB',
      );
    }

    await transition(first, 'cancelled').expect(200);
    await createJobViaApi(owner, { vehicle_registration: 'KDA 123A' });
  });
});

describe('job reads, edits and archive', () => {
  it('returns 404 for unknown jobs on every route', async () => {
    expectError(await owner.get('/jobs/nope'), 404, 'NOT_FOUND');
    expectError(await owner.get('/jobs/nope/history'), 404, 'NOT_FOUND');
    expectError(await owner.patch('/jobs/nope', { diagnosis: 'x' }, 1), 404, 'NOT_FOUND');
    expectError(await owner.post('/jobs/nope/assignment', { mechanic_id: null }, 1), 404, 'NOT_FOUND');
    expectError(await owner.post('/jobs/nope/transitions', { to_status: 'cancelled' }, 1), 404, 'NOT_FOUND');
    expectError(await owner.post('/jobs/nope/archive', undefined, 1), 404, 'NOT_FOUND');
  });

  it('patches under If-Match: partial updates, null clears, 428 and 412', async () => {
    const job = await createJobViaApi(owner, { vehicle_make: 'Toyota', internal_notes: 'Note' });

    expectError(await owner.patch(`/jobs/${job.id}`, { diagnosis: 'x' }), 428, 'PRECONDITION_REQUIRED');

    const updated = await owner
      .patch(`/jobs/${job.id}`, { diagnosis: '  Worn pads ', internal_notes: null }, job.version)
      .expect(200);
    expect(updated.body.data).toMatchObject({
      diagnosis: 'Worn pads',
      internal_notes: null,
      vehicle_make: 'Toyota',
      customer_name: job.customer_name,
      status: 'open',
      version: 2,
    });
    expect(updated.headers.etag).toBe('"v2"');

    expectError(await owner.patch(`/jobs/${job.id}`, { diagnosis: 'stale' }, 1), 412, 'PRECONDITION_FAILED');
    expectError(await owner.patch(`/jobs/${job.id}`, { customer_name: null }, 2), 422, 'VALIDATION_ERROR');
    expectError(await owner.patch(`/jobs/${job.id}`, {}, 2), 422, 'VALIDATION_ERROR');
    for (const forbidden of [{ status: 'completed' }, { assigned_mechanic_id: 'x' }, { job_number: 'x' }, { garage_id: 'x' }]) {
      expectError(await owner.patch(`/jobs/${job.id}`, forbidden, 2), 422, 'VALIDATION_ERROR');
    }

    expect((await owner.get(`/jobs/${job.id}`)).body.data).toMatchObject({ diagnosis: 'Worn pads', version: 2 });
  });

  it('applies the duplicate-registration check to registration edits', async () => {
    await createJobViaApi(owner, { vehicle_registration: 'AAA 111A' });
    const second = await createJobViaApi(owner, { vehicle_registration: 'BBB 222B' });

    expectError(
      await owner.patch(`/jobs/${second.id}`, { vehicle_registration: 'aaa111a' }, second.version),
      409,
      'DUPLICATE_ACTIVE_VEHICLE_JOB',
    );
    // Re-saving the job's own registration is not a duplicate.
    await owner.patch(`/jobs/${second.id}`, { vehicle_registration: 'bbb 222b' }, second.version).expect(200);
  });

  it('archives terminal jobs only, keeps them readable and keeps their history', async () => {
    const job = await createJobViaApi(owner);
    expectError(await owner.post(`/jobs/${job.id}/archive`, undefined, job.version), 409, 'CONFLICT');

    const cancelled = (await transition(job, 'cancelled', 'Customer left').expect(200)).body.data;
    const archived = await owner.post(`/jobs/${job.id}/archive`, undefined, cancelled.version).expect(200);
    expect(archived.body.data.archived_at).not.toBeNull();
    expect(archived.body.data.version).toBe(cancelled.version + 1);

    expectError(await owner.post(`/jobs/${job.id}/archive`, undefined, archived.body.data.version), 409, 'CONFLICT');

    await owner.get(`/jobs/${job.id}`).expect(200);
    const history = await owner.get(`/jobs/${job.id}/history`).expect(200);
    expect(history.body.total).toBe(1);

    expect((await owner.get('/jobs')).body.total).toBe(0);
    expect((await owner.get('/jobs?include_archived=true')).body.total).toBe(1);
  });

  it('frees the registration of an archived job for reuse', async () => {
    const job = await createJobViaApi(owner, { vehicle_registration: 'ZZZ 999Z' });
    const done = (await transition(job, 'cancelled').expect(200)).body.data;
    await owner.post(`/jobs/${job.id}/archive`, undefined, done.version).expect(200);
    await createJobViaApi(owner, { vehicle_registration: 'ZZZ 999Z' });
  });
});

describe('job lifecycle', () => {
  it('allows only the documented transitions', async () => {
    const mechanic = await createMechanicViaApi(owner);

    const open = await createJobViaApi(owner);
    for (const status of ['waiting', 'completed', 'open']) {
      expectError(await transition(open, status), 409, 'INVALID_STATUS_TRANSITION');
    }

    const started = await startedJob(mechanic);
    expectError(await transition(started, 'open'), 409, 'INVALID_STATUS_TRANSITION');

    const waiting = (await transition(started, 'waiting').expect(200)).body.data;
    expectError(await transition(waiting, 'completed'), 409, 'INVALID_STATUS_TRANSITION');

    const resumed = (await transition(waiting, 'in_progress').expect(200)).body.data;
    const completed = (await transition(resumed, 'completed', 'All done').expect(200)).body.data;
    expect(completed.status).toBe('completed');
    expect(completed.assigned_mechanic_id).toBe(mechanic.id);

    for (const status of ['open', 'in_progress', 'waiting', 'cancelled']) {
      expectError(await transition(completed, status), 409, 'INVALID_STATUS_TRANSITION');
    }
  });

  it('validates the transition body', async () => {
    const job = await createJobViaApi(owner);
    expectError(await owner.post(`/jobs/${job.id}/transitions`, {}, job.version), 422, 'VALIDATION_ERROR');
    expectError(await owner.post(`/jobs/${job.id}/transitions`, { to_status: 'flying' }, job.version), 422, 'VALIDATION_ERROR');
    expectError(
      await owner.post(`/jobs/${job.id}/transitions`, { to_status: 'cancelled', note: 'n'.repeat(501) }, job.version),
      422,
      'VALIDATION_ERROR',
    );
    expectError(await owner.post(`/jobs/${job.id}/transitions`, { to_status: 'cancelled' }), 428, 'PRECONDITION_REQUIRED');
    expectError(await owner.post(`/jobs/${job.id}/transitions`, { to_status: 'cancelled' }, 7), 412, 'PRECONDITION_FAILED');
  });

  it('requires an assigned, available mechanic to start work', async () => {
    const job = await createJobViaApi(owner);
    expectError(await transition(job, 'in_progress'), 409, 'MECHANIC_UNAVAILABLE');

    const mechanic = await createMechanicViaApi(owner);
    const assigned = (await assign(job, mechanic).expect(200)).body.data;

    const off = await owner.post(`/mechanics/${mechanic.id}/off-duty`, undefined, mechanic.version).expect(200);
    expectError(await transition(assigned, 'in_progress'), 409, 'MECHANIC_UNAVAILABLE');

    await owner.post(`/mechanics/${mechanic.id}/available`, undefined, off.body.data.version).expect(200);
    await transition(assigned, 'in_progress').expect(200);
  });

  it('marks the mechanic busy while working and releases them afterwards, bumping versions', async () => {
    const mechanic = await createMechanicViaApi(owner);
    const started = await startedJob(mechanic);

    let current = (await owner.get(`/mechanics/${mechanic.id}`)).body.data;
    expect(current).toMatchObject({ duty_status: 'busy', version: mechanic.version + 1 });

    const waiting = (await transition(started, 'waiting').expect(200)).body.data;
    current = (await owner.get(`/mechanics/${mechanic.id}`)).body.data;
    expect(current).toMatchObject({ duty_status: 'available', version: mechanic.version + 2 });

    const resumed = (await transition(waiting, 'in_progress').expect(200)).body.data;
    expect((await owner.get(`/mechanics/${mechanic.id}`)).body.data.duty_status).toBe('busy');

    await transition(resumed, 'cancelled').expect(200);
    expect((await owner.get(`/mechanics/${mechanic.id}`)).body.data.duty_status).toBe('available');
  });

  it('keeps an owner-designated off-duty mechanic off duty when their queued job is cancelled', async () => {
    const mechanic = await createMechanicViaApi(owner);
    const job = await createJobViaApi(owner);
    const assigned = (await assign(job, mechanic).expect(200)).body.data;
    await owner.post(`/mechanics/${mechanic.id}/off-duty`, undefined, mechanic.version).expect(200);
    await transition(assigned, 'cancelled').expect(200);
    expect((await owner.get(`/mechanics/${mechanic.id}`)).body.data.duty_status).toBe('off_duty');
  });

  it('rejects a second in-progress job for a busy mechanic and changes nothing', async () => {
    const mechanic = await createMechanicViaApi(owner);
    await startedJob(mechanic);

    const second = await createJobViaApi(owner);
    const queued = (await assign(second, mechanic).expect(200)).body.data;
    expectError(await transition(queued, 'in_progress'), 409, 'MECHANIC_OCCUPIED');

    const after = (await owner.get(`/jobs/${second.id}`)).body.data;
    expect(after).toMatchObject({ status: 'open', version: queued.version });
    expect((await owner.get(`/jobs/${second.id}/history`)).body.total).toBe(0);
  });

  it('lets only one of two racing jobs start for the same mechanic', async () => {
    const mechanic = await createMechanicViaApi(owner);
    const a = (await assign(await createJobViaApi(owner), mechanic).expect(200)).body.data;
    const b = (await assign(await createJobViaApi(owner), mechanic).expect(200)).body.data;

    const results = await Promise.all([transition(a, 'in_progress'), transition(b, 'in_progress')]);
    expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
    const loser = results.find((response) => response.status === 409);
    expect(loser.body.error.code).toBe('MECHANIC_OCCUPIED');

    const { rows } = await ctx.pool.query("SELECT count(*)::int AS n FROM jobs WHERE status = 'in_progress'");
    expect(rows[0].n).toBe(1);
  });

  it('lets only one of two requests with the same version succeed', async () => {
    const job = await createJobViaApi(owner);
    const results = await Promise.all([transition(job, 'cancelled', 'first'), transition(job, 'cancelled', 'second')]);
    expect(results.map((response) => response.status).sort()).toEqual([200, 412]);
    expect((await owner.get(`/jobs/${job.id}/history`)).body.total).toBe(1);
  });

  it('records every transition in newest-first, append-only history', async () => {
    const mechanic = await createMechanicViaApi(owner);
    const started = await startedJob(mechanic);
    const waiting = (await transition(started, 'waiting', 'Waiting for the customer').expect(200)).body.data;
    await transition(waiting, 'cancelled').expect(200);

    const history = await owner.get(`/jobs/${started.id}/history`).expect(200);
    expect(history.body).toMatchObject({ page: 1, page_size: 25, total: 3 });
    expect(history.body.data.map((event) => [event.from_status, event.to_status])).toEqual([
      ['waiting', 'cancelled'],
      ['in_progress', 'waiting'],
      ['open', 'in_progress'],
    ]);
    expect(history.body.data[1].note).toBe('Waiting for the customer');
    expect(history.body.data[0]).toMatchObject({ job_id: started.id, note: null });
    expect(history.body.data[0].actor_user_id).toBeTruthy();

    const paged = await owner.get(`/jobs/${started.id}/history?page=2&page_size=2`).expect(200);
    expect(paged.body.data).toHaveLength(1);
    expectError(await owner.get(`/jobs/${started.id}/history?order=asc`), 422, 'VALIDATION_ERROR');
    expectError(await owner.get(`/jobs/${started.id}/history?sort_by=note`), 422, 'VALIDATION_ERROR');

    await expect(ctx.pool.query("UPDATE job_history SET note = 'tampered'")).rejects.toThrow();
    await expect(ctx.pool.query('DELETE FROM job_history')).rejects.toThrow();
  });

  it('does not append history for rejected transitions', async () => {
    const job = await createJobViaApi(owner);
    await transition(job, 'completed').expect(409);
    await transition(job, 'bogus').expect(422);
    expect((await owner.get(`/jobs/${job.id}/history`)).body.total).toBe(0);
  });
});

describe('assignment', () => {
  it('assigns, reassigns and unassigns an open job', async () => {
    const alex = await createMechanicViaApi(owner, { name: 'Alex' });
    const blake = await createMechanicViaApi(owner, { name: 'Blake' });
    const job = await createJobViaApi(owner);

    const first = (await assign(job, alex).expect(200)).body.data;
    expect(first).toMatchObject({ assigned_mechanic_id: alex.id, version: 2 });
    expect((await owner.get(`/mechanics/${alex.id}`)).body.data.duty_status).toBe('available');

    const second = (await assign(first, blake).expect(200)).body.data;
    expect(second.assigned_mechanic_id).toBe(blake.id);

    const cleared = (await assign(second, null).expect(200)).body.data;
    expect(cleared.assigned_mechanic_id).toBeNull();
  });

  it('queues work for a busy mechanic but not for an off-duty or archived one', async () => {
    const busy = await createMechanicViaApi(owner, { name: 'Busy' });
    await startedJob(busy);
    await assign(await createJobViaApi(owner), busy).expect(200);

    const off = await createMechanicViaApi(owner, { name: 'Off' });
    await owner.post(`/mechanics/${off.id}/off-duty`, undefined, off.version).expect(200);
    const gone = await createMechanicViaApi(owner, { name: 'Gone' });
    await owner.post(`/mechanics/${gone.id}/archive`, undefined, gone.version).expect(200);

    const job = await createJobViaApi(owner);
    expectError(await assign(job, off), 409, 'MECHANIC_UNAVAILABLE');
    for (const mechanic_id of [gone.id, 'mech_unknown']) {
      const response = await owner.post(`/jobs/${job.id}/assignment`, { mechanic_id }, job.version);
      expectError(response, 422, 'VALIDATION_ERROR');
      expect(response.body.error.details[0].field).toBe('mechanic_id');
    }
  });

  it('refuses to assign terminal or archived jobs', async () => {
    const mechanic = await createMechanicViaApi(owner);
    const job = await createJobViaApi(owner);
    const done = (await transition(job, 'cancelled').expect(200)).body.data;
    expectError(await assign(done, mechanic), 409, 'CONFLICT');
    expectError(await assign(done, null), 409, 'CONFLICT');
  });

  it('rejects unassigning or busy-reassigning an in-progress job', async () => {
    const alex = await createMechanicViaApi(owner, { name: 'Alex' });
    const blake = await createMechanicViaApi(owner, { name: 'Blake' });
    const active = await startedJob(alex);

    expectError(await assign(active, null), 409, 'ACTIVE_JOB_CANNOT_BE_UNASSIGNED');

    const other = await startedJob(blake);
    expect(other.assigned_mechanic_id).toBe(blake.id);
    expectError(await assign(active, blake), 409, 'MECHANIC_OCCUPIED');
  });

  it('atomically hands an in-progress job to an available mechanic', async () => {
    const alex = await createMechanicViaApi(owner, { name: 'Alex' });
    const blake = await createMechanicViaApi(owner, { name: 'Blake' });
    const active = await startedJob(alex);

    const moved = (await assign(active, blake).expect(200)).body.data;
    expect(moved).toMatchObject({ status: 'in_progress', assigned_mechanic_id: blake.id });
    expect((await owner.get(`/mechanics/${alex.id}`)).body.data.duty_status).toBe('available');
    expect((await owner.get(`/mechanics/${blake.id}`)).body.data.duty_status).toBe('busy');
  });

  it('validates the assignment body and preconditions', async () => {
    const job = await createJobViaApi(owner);
    expectError(await owner.post(`/jobs/${job.id}/assignment`, {}, job.version), 422, 'VALIDATION_ERROR');
    expectError(await owner.post(`/jobs/${job.id}/assignment`, { mechanic_id: 5 }, job.version), 422, 'VALIDATION_ERROR');
    expectError(await owner.post(`/jobs/${job.id}/assignment`, { mechanic_id: null }), 428, 'PRECONDITION_REQUIRED');
    expectError(await owner.post(`/jobs/${job.id}/assignment`, { mechanic_id: null }, 9), 412, 'PRECONDITION_FAILED');
  });
});

describe('job list, search and dashboard', () => {
  async function seedList() {
    const alex = await createMechanicViaApi(owner, { name: 'Alex' });
    const one = await createJobViaApi(owner, { customer_name: 'Zed Customer', vehicle_registration: 'KAA 001A' });
    const two = await createJobViaApi(owner, { customer_name: 'Amy Customer', vehicle_registration: 'KBB 002B' });
    const three = await createJobViaApi(owner, { customer_name: 'Mid Customer', vehicle_registration: 'KCC 003C' });
    const assigned = (await assign(two, alex).expect(200)).body.data;
    await transition(assigned, 'in_progress').expect(200);
    await transition(three, 'cancelled').expect(200);
    return { alex, one, two, three };
  }

  it('searches job number, customer name and normalized registration', async () => {
    const { one } = await seedList();
    const names = async (query) => (await owner.get(`/jobs?${query}`).expect(200)).body.data.map((job) => job.customer_name);

    expect(await names('q=kaa001a')).toEqual(['Zed Customer']);
    expect(await names('q=KAA%20001')).toEqual(['Zed Customer']);
    expect(await names('q=amy')).toEqual(['Amy Customer']);
    expect(await names(`q=${one.job_number}`)).toEqual(['Zed Customer']);
    expect(await names('q=%25')).toEqual([]);
  });

  it('filters by status, mechanic and creation date in the garage time zone', async () => {
    const { alex } = await seedList();
    const customers = async (query) => (await owner.get(`/jobs?${query}`).expect(200)).body.data.map((job) => job.customer_name);

    expect(await customers('status=in_progress')).toEqual(['Amy Customer']);
    expect(await customers('status=cancelled')).toEqual(['Mid Customer']);
    expect(await customers(`mechanic_id=${alex.id}`)).toEqual(['Amy Customer']);

    const today = new Date().toISOString().slice(0, 10);
    expect((await owner.get(`/jobs?created_from=${today}&created_to=${today}`)).body.total).toBe(3);
    expect((await owner.get('/jobs?created_from=2000-01-01&created_to=2000-01-02')).body.total).toBe(0);
  });

  it('sorts with a stable tie-breaker and paginates on the server', async () => {
    await seedList();
    const asc = await owner.get('/jobs?sort_by=job_number&order=asc').expect(200);
    const numbers = asc.body.data.map((job) => job.job_number);
    expect(numbers).toEqual([...numbers].sort());
    expect(asc.body).toMatchObject({ page: 1, page_size: 25, total: 3 });

    const page2 = await owner.get('/jobs?sort_by=job_number&order=asc&page=2&page_size=2').expect(200);
    expect(page2.body.data.map((job) => job.job_number)).toEqual([numbers[2]]);
    expect(page2.body.page_size).toBe(2);
  });

  it('rejects invalid list parameters', async () => {
    for (const query of [
      'sort_by=customer_phone',
      'order=up',
      'page=0',
      'page_size=101',
      'status=done',
      'include_archived=1',
      'created_from=2026-02-30',
      'created_from=26-1-1',
      'created_from=2026-03-02&created_to=2026-03-01',
      'created_from=2025-01-01&created_to=2026-06-01',
      'garage_id=x',
      'q=',
    ]) {
      expectError(await owner.get(`/jobs?${query}`), 422, 'VALIDATION_ERROR');
    }
  });

  it('reports dashboard counts and recent jobs, excluding archived jobs', async () => {
    const { alex, three } = await seedList();
    // Complete one more job today, then archive the cancelled one.
    const done = await createJobViaApi(owner);
    const queued = (await assign(done, alex).expect(200)).body.data;
    expectError(await transition(queued, 'in_progress'), 409, 'MECHANIC_OCCUPIED');
    const cancelled = (await owner.get(`/jobs/${three.id}`)).body.data;
    await owner.post(`/jobs/${three.id}/archive`, undefined, cancelled.version).expect(200);

    const response = await owner.get('/dashboard').expect(200);
    expect(response.body.data).toMatchObject({
      open_count: 2,
      in_progress_count: 1,
      waiting_count: 0,
      completed_today_count: 0,
    });
    expect(response.body.data.recent_jobs).toHaveLength(3);
    expect(response.body.data.recent_jobs[0]).toEqual({
      id: expect.any(String),
      job_number: expect.any(String),
      status: expect.any(String),
      customer_name: expect.any(String),
      vehicle_registration: expect.any(String),
      assigned_mechanic: expect.anything(),
      updated_at: expect.any(String),
    });
    expectError(await owner.get('/dashboard?x=1'), 422, 'VALIDATION_ERROR');
  });

  it('counts completions by transition history within the garage local day', async () => {
    const mechanic = await createMechanicViaApi(owner);
    const started = await startedJob(mechanic);
    await transition(started, 'completed').expect(200);

    expect((await owner.get('/dashboard')).body.data.completed_today_count).toBe(1);

    // History is append-only, so backdate the event with the guard trigger paused for this fixture only.
    await ctx.pool.query('ALTER TABLE job_history DISABLE TRIGGER trg_job_history_append_only');
    try {
      await ctx.pool.query("UPDATE job_history SET created_at = now() - interval '3 days' WHERE to_status = 'completed'");
    } finally {
      await ctx.pool.query('ALTER TABLE job_history ENABLE TRIGGER trg_job_history_append_only');
    }
    expect((await owner.get('/dashboard')).body.data.completed_today_count).toBe(0);
  });
});
