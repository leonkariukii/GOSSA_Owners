import { request } from '../api.js';

export const mechanicKeys = {
  all: ['mechanics'],
  list: (params) => ['mechanics', 'list', params],
  options: ['mechanics', 'options'],
  detail: (id) => ['mechanics', 'detail', id],
};

/** Returns the full list envelope: { data, page, page_size, total }. */
export function listMechanics(params) {
  return request('GET', '/mechanics', { params });
}

export async function getMechanic(id) {
  return (await request('GET', `/mechanics/${encodeURIComponent(id)}`)).data;
}

export async function createMechanic(body) {
  return (await request('POST', '/mechanics', { body })).data;
}

export async function updateMechanic(mechanic, changes) {
  return (
    await request('PATCH', `/mechanics/${encodeURIComponent(mechanic.id)}`, {
      body: changes,
      version: mechanic.version,
    })
  ).data;
}

function action(name) {
  return async (mechanic) =>
    (
      await request('POST', `/mechanics/${encodeURIComponent(mechanic.id)}/${name}`, {
        version: mechanic.version,
      })
    ).data;
}

export const setOffDuty = action('off-duty');
export const setAvailable = action('available');
export const archiveMechanic = action('archive');
