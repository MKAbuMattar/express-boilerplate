import type express from 'express';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {Application} from '../../src/application.js';
import {Scopes} from '../../src/security/authorization/scopes.js';
import {TokenProvider} from '../../src/security/jwt/token.provider.js';
import {Principal} from '../../src/security/principal.js';
import {AuthStrategy} from '../../src/enumeration/auth-strategy.enum.js';
import {TestApp} from '../support/test-app.js';

describe('Security: scope-based authorization', () => {
  let application: Application;
  let app: express.Application;
  const token = (claims: Record<string, unknown>) =>
    application.beans.getBean(TokenProvider).createToken('someone', claims);
  const user = {name: 'Z', email: 'z@example.com', age: 1};

  beforeAll(async () => {
    ({application, app} = await TestApp.create());
  });
  afterAll(() => application.close());

  it('a valid token without the scope gets 403 insufficient_scope', async () => {
    const response = await request(app)
      .post('/api/v2/users')
      .auth(await token({}), {type: 'bearer'})
      .send(user);
    expect(response.status).toBe(403);
    expect(response.headers['www-authenticate']).toBe(
      'Bearer error="insufficient_scope", scope="users:write"',
    );
    expect(response.body).toMatchObject({
      title: 'Forbidden',
      data: {required: ['users:write'], missing: ['users:write']},
    });
  });

  it('no token is still 401, not 403', async () => {
    expect((await request(app).post('/api/v2/users').send(user)).status).toBe(
      401,
    );
  });

  it.each([
    ['PUT', '/api/v2/users/00000000-0000-4000-8000-000000000001', user],
    ['PATCH', '/api/v2/users/00000000-0000-4000-8000-000000000001', {age: 2}],
    ['DELETE', '/api/v2/users/00000000-0000-4000-8000-000000000001', undefined],
    ['POST', '/api/v1/users', user],
    ['DELETE', '/api/v1/users/00000000-0000-4000-8000-000000000001', undefined],
  ] as const)('%s %s needs users:write', async (method, path, body) => {
    const reader = await token({scope: 'users:read'});
    const req = request(app)
      [method.toLowerCase() as 'put'](path)
      .auth(reader, {type: 'bearer'});
    expect((await (body ? req.send(body) : req)).status).toBe(403);
  });

  it('ops routes need their own scope, not users:write', async () => {
    const writer = await token({scope: 'users:write'});
    expect(
      (await request(app).get('/api/v1/queues').auth(writer, {type: 'bearer'}))
        .status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/v1/network/ping')
          .auth(writer, {type: 'bearer'})
          .send({host: '127.0.0.1'})
      ).status,
    ).toBe(403);
    const ops = await token({scope: 'ops:queues'});
    expect(
      (await request(app).get('/api/v1/queues').auth(ops, {type: 'bearer'}))
        .status,
    ).toBe(200);
  });

  it.each([
    ['OAuth scope string', {scope: 'users:write openid'}],
    ['Entra ID scp array', {scp: ['users:write']}],
    ['roles array', {roles: ['users:write']}],
    ['Auth0 permissions', {permissions: ['users:write']}],
  ])('accepts the scope from %s', async (_label, claims) => {
    const response = await request(app)
      .post('/api/v2/users')
      .auth(await token(claims), {type: 'bearer'})
      .send({
        ...user,
        email: `${Math.random().toString(36).slice(2)}@example.com`,
      });
    expect(response.status).toBe(201);
  });

  it('a lookalike scope does not count', async () => {
    for (const scope of [
      'users:writer',
      'users',
      'USERS:WRITE',
      'users:write:x',
    ]) {
      const response = await request(app)
        .post('/api/v2/users')
        .auth(await token({scope}), {type: 'bearer'})
        .send(user);
      expect(response.status, scope).toBe(403);
    }
  });

  it('reuses one guard class per scope set', () => {
    expect(Scopes.require('a', 'b')).toBe(Scopes.require('b', 'a'));
    expect(Scopes.require('a')).not.toBe(Scopes.require('b'));
  });

  it('reads scopes from every known claim', () => {
    const principal = new Principal(AuthStrategy.OAuth2, 'x', {
      scope: 'a b',
      scp: ['c'],
      roles: ['d'],
      permissions: ['e', 42],
    });
    expect([...Scopes.of(principal)].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
