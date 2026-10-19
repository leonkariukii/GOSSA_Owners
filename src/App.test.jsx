import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { setCsrfToken } from './lib/api';

vi.mock('axios', () => ({ default: { request: vi.fn() } }));

const session = {
  user: { id: 'u1', name: 'Owner User', email: 'owner@example.com', role: 'owner' },
  garage: { id: 'g1', name: 'Northside Garage', time_zone: 'UTC' },
  csrf_token: 'csrf-token',
};

const now = '2026-10-04T08:15:00Z';

const makeJob = (overrides = {}) => ({
  id: 'job-1',
  garage_id: 'g1',
  job_number: 'JC-2026-001',
  status: 'open',
  customer_name: 'Sam Example',
  customer_phone: null,
  vehicle_registration: 'KDA 123A',
  vehicle_make: null,
  vehicle_model: null,
  vehicle_year: null,
  odometer_km: null,
  work_requested: 'Inspect front brakes',
  diagnosis: null,
  work_performed: null,
  internal_notes: null,
  assigned_mechanic_id: null,
  created_by_user_id: 'u1',
  created_at: now,
  updated_at: now,
  version: 1,
  archived_at: null,
  ...overrides,
});

const makeMechanic = (overrides = {}) => ({
  id: 'mech-1',
  garage_id: 'g1',
  name: 'Alex Mechanic',
  phone: '+254700000000',
  skills: null,
  duty_status: 'available',
  created_at: now,
  updated_at: now,
  version: 1,
  archived_at: null,
  ...overrides,
});

const page = (data) => ({ data, page: 1, page_size: 25, total: data.length });
const ok = (data, status = 200) => ({ data, status });

function apiError(status, code, message, details) {
  return { response: { status, data: { error: { code, message, status, request_id: 'req_test', details } } } };
}

/** Install a fake API. `handlers` maps "METHOD /path" to (config) => response (or throws). */
function fakeApi(handlers) {
  const calls = [];
  axios.request.mockImplementation(async (config) => {
    const method = (config.method ?? 'get').toUpperCase();
    const path = config.url.replace('/api/v1', '');
    calls.push({ method, path, ...config });
    if (method === 'GET' && path === '/auth/me') return ok({ data: session });
    const handler = handlers[`${method} ${path}`];
    if (!handler) return ok({ data: {} });
    return handler(config);
  });
  return calls;
}

function renderAt(hash) {
  window.location.hash = hash;
  return render(<App />);
}

describe('GOSSA owner app', () => {
  beforeEach(() => {
    setCsrfToken(null);
    window.location.hash = '';
  });

  afterEach(() => {
    cleanup();
    axios.request.mockReset();
  });

  it('shows the sign-in screen when there is no session', async () => {
    axios.request.mockRejectedValue(apiError(401, 'UNAUTHENTICATED', 'Authentication required.'));
    renderAt('#/');
    expect(await screen.findByRole('heading', { name: /gossa owner sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toHaveValue('');
    expect(screen.getByLabelText(/password/i)).toHaveValue('');
  });

  it('shows the sign-in screen with a retry when the API is unreachable', async () => {
    axios.request
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockRejectedValueOnce(apiError(401, 'UNAUTHENTICATED', 'Authentication required.'));
    renderAt('#/');
    expect(await screen.findByRole('heading', { name: /gossa owner sign in/i })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in requires the server.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
    await waitFor(() => expect(axios.request).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('shows the sign-in screen when the API proxy returns a server error', async () => {
    axios.request.mockRejectedValue(apiError(502, 'UNKNOWN_ERROR', 'Bad Gateway.'));
    renderAt('#/');
    expect(await screen.findByRole('heading', { name: /gossa owner sign in/i })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in requires the server.');
    expect(screen.getByRole('button', { name: 'Retry connection' })).toBeInTheDocument();
  });

  it('signs in with a generic message on failure, then shows the dashboard', async () => {
    let signedIn = false;
    axios.request.mockImplementation(async (config) => {
      const path = config.url.replace('/api/v1', '');
      if (path === '/auth/me' && !signedIn) throw apiError(401, 'UNAUTHENTICATED', 'Authentication required.');
      if (path === '/auth/login') {
        if (config.data.password === 'correct horse battery') {
          signedIn = true;
          return ok({ data: session });
        }
        throw apiError(401, 'UNAUTHENTICATED', 'Invalid email or password.');
      }
      if (path === '/dashboard') {
        return ok({ data: { open_count: 3, in_progress_count: 1, waiting_count: 0, completed_today_count: 2, recent_jobs: [] } });
      }
      return ok({ data: session });
    });

    renderAt('#/');
    fireEvent.change(await screen.findByLabelText(/email/i), { target: { value: 'owner@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrong password!!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Incorrect email or password.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'correct horse battery' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(await screen.findByText('No jobs yet. Create the first job to get started.')).toBeInTheDocument();
    expect(screen.getByText('Northside Garage')).toBeInTheDocument();
  });

  it('renders mechanics from the paginated list and refreshes after creating one', async () => {
    let mechanics = [];
    const calls = fakeApi({
      'GET /mechanics': () => ok(page(mechanics)),
      'POST /mechanics': (config) => {
        mechanics = [makeMechanic({ name: config.data.name })];
        return ok({ data: mechanics[0] }, 201);
      },
    });

    renderAt('#/mechanics');
    expect(await screen.findByText(/no mechanics match these filters/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add mechanic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save mechanic' }));
    expect(await screen.findByText('Name is required.')).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);

    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: '  Alex Mechanic ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save mechanic' }));

    expect(await screen.findByRole('link', { name: 'Alex Mechanic' })).toBeInTheDocument();
    const post = calls.find((call) => call.method === 'POST');
    expect(post.data).toEqual({ name: 'Alex Mechanic', phone: null, skills: null });
    expect(post.headers['X-CSRF-Token']).toBe('csrf-token');
  });

  it('reflects list filters from the URL in the API request', async () => {
    const calls = fakeApi({
      'GET /jobs': () => ok(page([makeJob()])),
      'GET /mechanics': () => ok(page([])),
    });
    renderAt('#/jobs?status=waiting&q=kda&page=2');
    expect(await screen.findByRole('link', { name: 'JC-2026-001' })).toBeInTheDocument();
    const list = calls.find((call) => call.path === '/jobs');
    expect(list.params).toMatchObject({ status: 'waiting', q: 'kda', page: 2, sort_by: 'created_at', order: 'desc' });
  });

  it('keeps entered data and shows field errors when job creation fails validation', async () => {
    fakeApi({
      'POST /jobs': () => {
        throw apiError(409, 'DUPLICATE_ACTIVE_VEHICLE_JOB', 'Another active job has the same registration.');
      },
    });
    renderAt('#/jobs/new');

    fireEvent.change(await screen.findByLabelText(/customer name/i), { target: { value: 'Sam Example' } });
    fireEvent.change(screen.getByLabelText(/vehicle registration/i), { target: { value: 'KDA 123A' } });
    fireEvent.change(screen.getByLabelText(/work requested/i), { target: { value: 'Brakes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create job' }));

    expect(await screen.findByText(/another active job already exists for this vehicle registration/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/customer name/i)).toHaveValue('Sam Example');
    expect(screen.getByLabelText(/vehicle registration/i)).toHaveValue('KDA 123A');
  });

  it('starts a job with If-Match and only shows the new status once the server confirms', async () => {
    let job = makeJob({ assigned_mechanic_id: 'mech-1' });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const calls = fakeApi({
      'GET /jobs/job-1': () => ok({ data: job }),
      'GET /jobs/job-1/history': () => ok(page([])),
      'GET /mechanics/mech-1': () => ok({ data: makeMechanic() }),
      'GET /mechanics': () => ok(page([makeMechanic()])),
      'POST /jobs/job-1/transitions': async () => {
        await gate;
        job = makeJob({ assigned_mechanic_id: 'mech-1', status: 'in_progress', version: 2 });
        return ok({ data: job });
      },
    });

    renderAt('#/jobs/job-1');
    const start = await screen.findByRole('button', { name: 'Start work' });
    fireEvent.click(start);

    await waitFor(() => expect(calls.some((c) => c.path === '/jobs/job-1/transitions')).toBe(true));
    const post = calls.find((c) => c.path === '/jobs/job-1/transitions');
    expect(post.headers['If-Match']).toBe('"v1"');
    expect(post.data).toEqual({ to_status: 'in_progress' });

    // Still pending: the old status is unchanged and no success message is shown.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Open');
    expect(screen.queryByText(/job is now/i)).not.toBeInTheDocument();

    release();
    expect(await screen.findByText('Job is now in progress.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('In progress');
  });

  it('requires confirmation before cancelling a job', async () => {
    let job = makeJob();
    const calls = fakeApi({
      'GET /jobs/job-1': () => ok({ data: job }),
      'GET /jobs/job-1/history': () => ok(page([])),
      'GET /mechanics': () => ok(page([])),
      'POST /jobs/job-1/transitions': () => {
        job = makeJob({ status: 'cancelled', version: 2 });
        return ok({ data: job });
      },
    });

    renderAt('#/jobs/job-1');
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel job' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep job' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel job' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Yes, cancel job' }));
    expect(await screen.findByText('Job is now cancelled.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive job' })).toBeInTheDocument();
  });

  it('reloads the latest version and explains a stale (412) update', async () => {
    let job = makeJob({ version: 1 });
    const calls = fakeApi({
      'GET /jobs/job-1': () => ok({ data: job }),
      'GET /jobs/job-1/history': () => ok(page([])),
      'GET /mechanics': () => ok(page([])),
      'POST /jobs/job-1/transitions': () => {
        job = makeJob({ version: 5, diagnosis: 'Changed elsewhere' });
        throw apiError(412, 'PRECONDITION_FAILED', 'Stale version.');
      },
    });

    renderAt('#/jobs/job-1');
    fireEvent.click(await screen.findByRole('button', { name: 'Start work' }));
    expect(await screen.findByText(/changed elsewhere — latest version loaded/i)).toBeInTheDocument();
    expect(await screen.findByText('Changed elsewhere')).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/jobs/job-1' && c.method === 'GET').length).toBeGreaterThan(1);
  });

  it('shows not-found for a job that does not exist', async () => {
    fakeApi({ 'GET /jobs/missing': () => { throw apiError(404, 'NOT_FOUND', 'Job not found.'); } });
    renderAt('#/jobs/missing');
    expect(await screen.findByText(/couldn.t find that job/i)).toBeInTheDocument();
  });

  it('renders user-supplied values as text, not HTML', async () => {
    fakeApi({
      'GET /jobs/job-1': () => ok({ data: makeJob({ customer_name: '<img src=x onerror=alert(1)>' }) }),
      'GET /jobs/job-1/history': () => ok(page([])),
      'GET /mechanics': () => ok(page([])),
    });
    const { container } = renderAt('#/jobs/job-1');
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('saves garage settings under If-Match and updates the header', async () => {
    let garage = { id: 'g1', name: 'Northside Garage', time_zone: 'UTC', version: 1 };
    const calls = fakeApi({
      'GET /garage': () => ok({ data: garage }),
      'PATCH /garage': (config) => {
        garage = { ...garage, ...config.data, version: 2 };
        return ok({ data: garage });
      },
    });

    renderAt('#/settings');
    const name = await screen.findByLabelText(/garage name/i);
    fireEvent.change(name, { target: { value: 'Southside Garage' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText('Garage settings saved.')).toBeInTheDocument();
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch.headers['If-Match']).toBe('"v1"');
    expect(patch.data).toEqual({ name: 'Southside Garage' });
    expect(screen.getAllByText('Southside Garage').length).toBeGreaterThan(0);
  });
});
