import type express from 'express';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {Application} from '../../src/application.js';
import {TokenProvider} from '../../src/security/jwt/token.provider.js';
import {TestApp} from '../support/test-app.js';

describe('UserV1Resource', () => {
  let application: Application;
  let app: express.Application;
  let token: string;

  beforeAll(async () => {
    ({application, app} = await TestApp.create());
    token = await application.beans
      .getBean(TokenProvider)
      .createToken('admin', TestApp.ALL_SCOPES);
  });
  afterAll(() => application.close());

  it('health reports the database type', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({database: 'sqljs', cache: 'memory'});
  });

  it('rejects create without a JWT', async () => {
    const response = await request(app)
      .post('/api/users')
      .send({name: 'A', email: 'a@example.com', age: 30});
    expect(response.status).toBe(401);
  });

  it('validates the body with 400 and field errors', async () => {
    const response = await request(app)
      .post('/api/users')
      .auth(token, {type: 'bearer'})
      .send({name: '', email: 'nope', age: -1});
    expect(response.status).toBe(400);
    expect(Object.keys(response.body.data)).toEqual(['name', 'email', 'age']);
  });

  it('creates, reads, conflicts, deletes and 404s', async () => {
    const created = await request(app)
      .post('/api/users')
      .auth(token, {type: 'bearer'})
      .send({name: 'Alice', email: 'Alice@Example.com', age: 42});
    expect(created.status).toBe(201);
    const {id} = created.body.data;

    const found = await request(app).get(`/api/users/${id}`);
    expect(found.status).toBe(200);
    expect(found.body.data.email).toBe('alice@example.com');

    const duplicate = await request(app)
      .post('/api/users')
      .auth(token, {type: 'bearer'})
      .send({name: 'Alice', email: 'alice@example.com', age: 42});
    expect(duplicate.status).toBe(409);

    const list = await request(app).get('/api/users');
    expect(list.body.data).toHaveLength(1);

    const deleted = await request(app)
      .delete(`/api/users/${id}`)
      .auth(token, {type: 'bearer'});
    expect(deleted.status).toBe(204);

    const missing = await request(app).get(`/api/users/${id}`);
    expect(missing.status).toBe(404);
  });

  it('returns 404 JSON for unknown routes', async () => {
    const response = await request(app).get('/nope');
    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });

  it('does not serve Swagger outside development', async () => {
    expect((await request(app).get('/docs')).status).toBe(404);
  });
});
