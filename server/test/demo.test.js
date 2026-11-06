import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { assertPublicDemoDatabase, resetPublicDemoData } from '../src/demo.js';
import { createTestContext, resetDatabase, seedGarage } from './helpers.js';

const ctx = createTestContext();

beforeEach(async () => {
  await resetDatabase(ctx.pool);
  await seedGarage(ctx.pool);
});

afterAll(() => ctx.pool.end());

describe('public demo database guard', () => {
  it('refuses to inspect or reset any database other than gossa_demo', async () => {
    const before = await ctx.pool.query('SELECT COUNT(*)::int AS owners FROM owner_users');

    await expect(assertPublicDemoDatabase(ctx.pool)).rejects.toThrow('expected "gossa_demo"');
    await expect(resetPublicDemoData(ctx.pool)).rejects.toThrow('expected "gossa_demo"');

    const after = await ctx.pool.query('SELECT COUNT(*)::int AS owners FROM owner_users');
    expect(after.rows[0].owners).toBe(before.rows[0].owners);
  });
});
