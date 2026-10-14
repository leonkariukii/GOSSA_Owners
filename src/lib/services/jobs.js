import { request } from '../api.js';

export const jobKeys = {
  all: ['jobs'],
  list: (params) => ['jobs', 'list', params],
  detail: (id) => ['jobs', 'detail', id],
  history: (id, params) => ['jobs', 'history', id, params],
};

const enc = encodeURIComponent;

export function listJobs(params) {
  return request('GET', '/jobs', { params });
}

export async function getJob(id) {
  return (await request('GET', `/jobs/${enc(id)}`)).data;
}

export async function createJob(body) {
  return (await request('POST', '/jobs', { body })).data;
}

export async function updateJob(job, changes) {
  return (await request('PATCH', `/jobs/${enc(job.id)}`, { body: changes, version: job.version })).data;
}

export async function assignMechanic(job, mechanicId) {
  return (
    await request('POST', `/jobs/${enc(job.id)}/assignment`, {
      body: { mechanic_id: mechanicId },
      version: job.version,
    })
  ).data;
}

export async function transitionJob(job, toStatus, note) {
  const body = { to_status: toStatus };
  if (note) body.note = note;
  return (
    await request('POST', `/jobs/${enc(job.id)}/transitions`, { body, version: job.version })
  ).data;
}

export async function archiveJob(job) {
  return (await request('POST', `/jobs/${enc(job.id)}/archive`, { version: job.version })).data;
}

export function getJobHistory(id, params) {
  return request('GET', `/jobs/${enc(id)}/history`, { params });
}
