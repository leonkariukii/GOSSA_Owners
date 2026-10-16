import { request } from '../api.js';

export const dashboardKey = ['dashboard'];

export async function getDashboard() {
  return (await request('GET', '/dashboard')).data;
}
