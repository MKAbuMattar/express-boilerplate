import type express from 'express';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {Application} from '../../src/application.js';
import {TokenProvider} from '../../src/security/jwt/token.provider.js';
import {TestApp} from '../support/test-app.js';

describe('API versioning (/api/v1, /api/v2)', () => {
  let application: Application;
  let app: express.Application;
  let token: string;

  beforeAll(async () => {
    ({application, app} = await TestApp.create());
    token = await application.beans.getBean(TokenProvider).createToken('admin');
    for (const [name, email, phone] of [
      ['Alice', 'alice@example.com', '+962 79 123 4567'],
      ['Bob', 'bob@example.com', null],
      ['Carol 100%', 'carol_x@example.com', null],
    ] as const) {
      await request(app)
        .post('/api/v2/users')
        .auth(token, {type: 'bearer'})
        .send({name, email, age: 30, phone});
    }
  });
  afterAll(() => application.close());

  it('unversioned /api/* is an alias of v1', async () => {
    const legacy = await request(app).get('/api/users');
    const v1 = await request(app).get('/api/v1/users');
    expect(legacy.status).toBe(200);
    expect(legacy.body).toEqual(v1.body);
    expect(legacy.headers['api-version']).toBe('v1');
  });

  it('v1 keeps its old shape: no phone field', async () => {
    const response = await request(app).get('/api/v1/users');
    expect(response.headers['api-version']).toBe('v1');
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data[0]).not.toHaveProperty('phone');
  });

  it('v2 lists pages and includes phone', async () => {
    const response = await request(app).get('/api/v2/users?page=1&size=2');
    expect(response.headers['api-version']).toBe('v2');
    expect(response.body.data).toMatchObject({
      page: 1,
      size: 2,
      total: 3,
      pages: 2,
    });
    expect(response.body.data.items).toHaveLength(2);
    const all = await request(app).get('/api/v2/users?size=10');
    const alice = all.body.data.items.find(
      (u: {name: string}) => u.name === 'Alice',
    );
    expect(alice).toHaveProperty('phone', '+962 79 123 4567');
  });

  it('v2 search is case-insensitive over name and email', async () => {
    const byName = await request(app).get('/api/v2/users?search=ALI');
    expect(byName.body.data.items.map((u: {name: string}) => u.name)).toEqual([
      'Alice',
    ]);
    const byEmail = await request(app).get('/api/v2/users?search=bob@');
    expect(byEmail.body.data.total).toBe(1);
  });

  it('treats LIKE wildcards in search as literal characters', async () => {
    const percent = await request(app).get(
      `/api/v2/users?search=${encodeURIComponent('100%')}`,
    );
    expect(percent.body.data.items.map((u: {name: string}) => u.name)).toEqual([
      'Carol 100%',
    ]);
    const underscore = await request(app).get('/api/v2/users?search=_x');
    expect(underscore.body.data.total).toBe(1);
    const onlyPercent = await request(app).get(
      `/api/v2/users?search=${encodeURIComponent('%')}`,
    );
    expect(onlyPercent.body.data.total).toBe(1);
  });

  it('rejects bad paging with 400 problem details', async () => {
    const response = await request(app).get('/api/v2/users?page=0&size=1000');
    expect(response.status).toBe(400);
    expect(Object.keys(response.body.data)).toEqual(['page', 'size']);
  });

  it('v2 validates phone; v1 ignores it', async () => {
    const bad = await request(app)
      .post('/api/v2/users')
      .auth(token, {type: 'bearer'})
      .send({name: 'D', email: 'd@example.com', age: 1, phone: 'call me'});
    expect(bad.status).toBe(400);
    expect(bad.body.data).toHaveProperty('phone');

    const v1 = await request(app)
      .post('/api/v1/users')
      .auth(token, {type: 'bearer'})
      .send({name: 'E', email: 'e@example.com', age: 1, phone: 'ignored'});
    expect(v1.status).toBe(201);
    const v2view = await request(app).get(`/api/v2/users/${v1.body.data.id}`);
    expect(v2view.body.data.phone).toBeNull();
  });
});
