import type express from 'express';
import request from 'supertest';
import {DataSource} from 'typeorm';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {Application} from '../../src/application.js';
import {TokenProvider} from '../../src/security/jwt/token.provider.js';
import {TestApp} from '../support/test-app.js';

/**
 * SQL injection: classic payloads through every input that reaches the
 * database (path ids, list search, request bodies). Passing means each
 * payload was treated as plain data: no extra rows, no errors, no 5xx, and
 * the table still holds exactly what it held before.
 */
describe('Security: SQL injection', () => {
  let application: Application;
  let app: express.Application;
  let auth: {authorization: string};

  const PAYLOADS = [
    "' OR '1'='1",
    "' OR 1=1 --",
    "1' OR '1'='1' /*",
    "'; DROP TABLE users; --",
    '1; DELETE FROM users',
    "' UNION SELECT id, email, name, age, phone, createdAt, updatedAt FROM users --",
    "admin'--",
    '" OR ""="',
    "%' OR 'x'='x",
    "') OR ('a'='a",
    '1 AND SLEEP(5)',
    "'; SELECT pg_sleep(5); --",
    "\\'; DROP TABLE users; --",
    '%',
    '_',
    '!',
  ];

  const countRows = async () =>
    Number(
      (
        await application.beans
          .getBean(DataSource)
          .query('SELECT COUNT(*) AS n FROM users')
      )[0].n,
    );

  beforeAll(async () => {
    ({application, app} = await TestApp.create());
    auth = {
      authorization: `Bearer ${await application.beans.getBean(TokenProvider).createToken('sec')}`,
    };
    for (const name of ['Alice', 'Bob']) {
      await request(app)
        .post('/api/v2/users')
        .set(auth)
        .send({name, email: `${name.toLowerCase()}@example.com`, age: 30});
    }
  });
  afterAll(() => application.close());

  it.each(PAYLOADS)('path id %j: 404, nothing leaked', async (payload) => {
    for (const version of ['v1', 'v2']) {
      const response = await request(app).get(
        `/api/${version}/users/${encodeURIComponent(payload)}`,
      );
      expect(response.status).toBe(404);
    }
    const del = await request(app)
      .delete(`/api/v2/users/${encodeURIComponent(payload)}`)
      .set(auth);
    expect(del.status).toBe(404);
    expect(await countRows()).toBe(2);
  });

  it.each(PAYLOADS)('search %j matches only literal text', async (payload) => {
    const response = await request(app).get(
      `/api/v2/users?search=${encodeURIComponent(payload)}`,
    );
    expect(response.status).toBe(200);
    // No stored name or email contains these strings, so nothing matches.
    expect(response.body.data.total).toBe(0);
    expect(await countRows()).toBe(2);
  });

  it.each(PAYLOADS)('body field %j is stored verbatim', async (payload) => {
    const email = `p${Math.random().toString(36).slice(2)}@example.com`;
    const created = await request(app)
      .post('/api/v2/users')
      .set(auth)
      .send({name: payload.slice(0, 120), email, age: 1});
    expect(created.status).toBe(201);
    const read = await request(app).get(
      `/api/v2/users/${created.body.data.id}`,
    );
    expect(read.body.data.name).toBe(payload.slice(0, 120).trim());
    await request(app)
      .delete(`/api/v2/users/${created.body.data.id}`)
      .set(auth);
    expect(await countRows()).toBe(2);
  });

  it('rejects SQL in fields that have a strict format', async () => {
    const response = await request(app).post('/api/v2/users').set(auth).send({
      name: 'X',
      email: "x'@x.io; DROP TABLE users",
      age: '1 OR 1=1',
      phone: "'; --",
    });
    expect(response.status).toBe(400);
    expect(Object.keys(response.body.data)).toEqual(['email', 'age', 'phone']);
  });

  it('time-based payloads do not delay the response', async () => {
    const started = Date.now();
    await request(app).get(
      `/api/v2/users?search=${encodeURIComponent("' AND SLEEP(3) --")}`,
    );
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
