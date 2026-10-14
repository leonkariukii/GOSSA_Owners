import { request } from '../api.js';

export const garageKey = ['garage'];

export async function getGarage() {
  return (await request('GET', '/garage')).data;
}

export async function updateGarage(garage, changes) {
  return (await request('PATCH', '/garage', { body: changes, version: garage.version })).data;
}
