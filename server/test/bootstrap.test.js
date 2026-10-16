import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { BootstrapError, bootstrapOwner } from '../src/bootstrap.js';
import { createTestContext, resetDatabase } from './helpers.js';

const ctx = createTestContext();

beforeEach(() => resetDatabase(ctx.pool));
afterAll(() => ctx.pool.end());

const input = {
  garageName: '  Northside Garage ',
  timeZone: 'Africa/Nairobi',
  ownerName: 'Owner User',
  ownerEmail: ' Owner@Example.COM ',
  ownerPassword: 'a very long passphrase',
};

describe('bootstrapOwner', () => {
  it('creates the garage and an Argon2id-hashed owner who can sign in', async () => {
    const result = await bootstrapOwner(ctx.pool, input);
    expect(result).toEqual({ created: true, garageName: 'Northside Garage', ownerEmail: 'owner@example.com' });
    expect(JSON.stringify(result)).not.toContain(input.ownerPassword);

    const { rows } = await ctx.pool.query('SELECT email, password_hash FROM owner_users');
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('owner@example.com');
    expect(rows[0].password_hash).toMatch(/^\$argon2id\$/);
    expect(await argon2.verify(rows[0].password_hash, input.ownerPassword)).toBe(true);

    const login = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner@example.com', password: input.ownerPassword })
      .expect(200);
    expect(login.body.data.garage).toMatchObject({ name: 'Northside Garage', time_zone: 'Africa/Nairobi' });
  });

  it('is idempotent and never overwrites an existing owner', async () => {
    await bootstrapOwner(ctx.pool, input);
    const again = await bootstrapOwner(ctx.pool, { ...input, ownerEmail: 'someone@else.com', ownerPassword: 'another long passphrase' });
    expect(again).toEqual({ created: false });

    const { rows } = await ctx.pool.query('SELECT email FROM owner_users');
    expect(rows.map((row) => row.email)).toEqual(['owner@example.com']);
    expect((await ctx.pool.query('SELECT 1 FROM garages')).rowCount).toBe(1);
  });

  it('creates only one owner when run concurrently', async () => {
    const results = await Promise.all([bootstrapOwner(ctx.pool, input), bootstrapOwner(ctx.pool, input)]);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect((await ctx.pool.query('SELECT 1 FROM owner_users')).rowCount).toBe(1);
  });

  it('rejects invalid input without writing anything', async () => {
    for (const bad of [
      { garageName: '' },
      { garageName: 'x'.repeat(121) },
      { timeZone: 'Mars/Olympus' },
      { ownerName: '   ' },
      { ownerEmail: 'not-an-email' },
      { ownerPassword: 'short' },
      { ownerPassword: 'p'.repeat(129) },
    ]) {
      await expect(bootstrapOwner(ctx.pool, { ...input, ...bad })).rejects.toBeInstanceOf(BootstrapError);
    }
    expect((await ctx.pool.query('SELECT 1 FROM garages')).rowCount).toBe(0);
    expect((await ctx.pool.query('SELECT 1 FROM owner_users')).rowCount).toBe(0);
  });

  it('does not trim or truncate the password', async () => {
    const password = '  padded passphrase  ';
    await bootstrapOwner(ctx.pool, { ...input, ownerPassword: password });
    await request(ctx.app).post('/api/v1/auth/login').send({ email: 'owner@example.com', password }).expect(200);
    await request(ctx.app).post('/api/v1/auth/login').send({ email: 'owner@example.com', password: password.trim() }).expect(401);
  });

  it('enforces a single owner per garage at the database level', async () => {
    await bootstrapOwner(ctx.pool, input);
    const { rows } = await ctx.pool.query('SELECT id, garage_id, password_hash FROM owner_users');
    await expect(
      ctx.pool.query(
        'INSERT INTO owner_users (id, garage_id, name, email, password_hash) VALUES ($1, $2, $3, $4, $5)',
        ['user_second', rows[0].garage_id, 'Second', 'second@example.com', rows[0].password_hash],
      ),
    ).rejects.toThrow();
  });
});
