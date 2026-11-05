import express from 'express';
import type {Logger} from 'pino';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import type {Application} from '../../src/application.js';
import {CacheStore} from '../../src/config/cache/cache-store.js';
import {AuthStrategy} from '../../src/enumeration/auth-strategy.enum.js';
import {RequestGuards} from '../../src/middleware/request-guards.js';
import {TokenProvider} from '../../src/security/jwt/token.provider.js';
import {Principal} from '../../src/security/principal.js';
import {UserService} from '../../src/service/user.service.js';
import {TestApp} from '../support/test-app.js';

describe('Security: request guards', () => {
  let application: Application;
  let app: express.Application;
  let auth: {authorization: string};
  const user = (email: string) => ({name: 'G', email, age: 1});

  beforeAll(async () => {
    ({application, app} = await TestApp.create({
      PUBLIC_URL: 'https://api.example.com',
      CORS_ORIGINS: 'https://app.example.com',
      JSON_MAX_DEPTH: '8',
      JSON_MAX_NODES: '200',
      HTTP_HANDLER_TIMEOUT_MS: '300',
    }));
    auth = {
      authorization: `Bearer ${await application.beans.getBean(TokenProvider).createToken('g', TestApp.ALL_SCOPES)}`,
    };
  });
  afterAll(() => application.close());

  describe('request id', () => {
    it('makes one, echoes a valid one, replaces a malicious one', async () => {
      const made = await request(app).get('/api/v1/users');
      expect(made.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
      const kept = await request(app)
        .get('/api/v1/users')
        .set('x-request-id', 'trace-123');
      expect(kept.headers['x-request-id']).toBe('trace-123');
      const bad = await request(app)
        .get('/api/v1/users')
        .set('x-request-id', 'a b<script>');
      expect(bad.headers['x-request-id']).not.toBe('a b<script>');
    });

    it('is in problem details so an error report finds the log line', async () => {
      const response = await request(app)
        .get('/api/v1/nope')
        .set('x-request-id', 'find-me');
      expect(response.body.requestId).toBe('find-me');
    });
  });

  describe('host validation', () => {
    it.each(['api.example.com', 'localhost:8443', '127.0.0.1'])(
      'serves %s',
      async (host) => {
        expect(
          (await request(app).get('/api/v1/users').set('host', host)).status,
        ).toBe(200);
      },
    );
    it('421 for any other host, health exempt', async () => {
      expect(
        (await request(app).get('/api/v1/users').set('host', 'evil.example'))
          .status,
      ).toBe(421);
      expect(
        (await request(app).get('/api/v1/health').set('host', '10.0.0.5'))
          .status,
      ).toBe(200);
    });
  });

  describe('cross-site (CSRF)', () => {
    it('blocks a cross-site browser write, allows the app origin', async () => {
      const blocked = await request(app)
        .post('/api/v2/users')
        .set(auth)
        .set('sec-fetch-site', 'cross-site')
        .set('origin', 'https://evil.example')
        .send(user('csrf1@example.com'));
      expect(blocked.status).toBe(403);
      const allowed = await request(app)
        .post('/api/v2/users')
        .set(auth)
        .set('sec-fetch-site', 'cross-site')
        .set('origin', 'https://app.example.com')
        .send(user('csrf2@example.com'));
      expect(allowed.status).toBe(201);
    });

    it('blocks an older browser (no Fetch Metadata) posting cookies from another origin', async () => {
      const response = await request(app)
        .post('/auth/logout')
        .set('origin', 'https://evil.example')
        .set('cookie', 'session=x');
      expect(response.status).toBe(403);
    });

    it('lets header-authenticated API clients and reads through', async () => {
      expect(
        (
          await request(app)
            .post('/api/v2/users')
            .set(auth)
            .send(user('csrf3@example.com'))
        ).status,
      ).toBe(201);
      expect(
        (
          await request(app)
            .get('/api/v1/users')
            .set('sec-fetch-site', 'cross-site')
            .set('origin', 'https://evil.example')
        ).status,
      ).toBe(200);
    });
  });

  describe('ops IP allowlist', () => {
    it('blocks ops routes from outside OPS_ALLOWED_CIDRS even with a valid token', async () => {
      const {application: locked, app: lockedApp} = await TestApp.create({
        OPS_ALLOWED_CIDRS: '10.0.0.0/8',
      });
      try {
        const token = await locked.beans
          .getBean(TokenProvider)
          .createToken('ops', TestApp.ALL_SCOPES);
        const response = await request(lockedApp)
          .get('/api/v1/queues')
          .auth(token, {type: 'bearer'});
        expect(response.status).toBe(403);
        expect(response.body.detail).toBe('Not allowed from this network');
        expect((await request(lockedApp).get('/api/v1/users')).status).toBe(
          200,
        );
      } finally {
        await locked.close();
      }
    });
    it('allows loopback by default', async () => {
      expect((await request(app).get('/api/v1/queues').set(auth)).status).toBe(
        200,
      );
    });
  });

  describe('JSON complexity', () => {
    it('rejects deep nesting and very wide bodies', async () => {
      let deep: unknown = 1;
      for (let i = 0; i < 20; i++) deep = {a: deep};
      const tooDeep = await request(app)
        .post('/api/v2/users')
        .set(auth)
        .send({name: 'x', deep});
      expect(tooDeep.status).toBe(400);
      expect(tooDeep.body.detail).toMatch(/JSON too complex/);
      const wide = await request(app)
        .post('/api/v1/queues/demo/jobs')
        .set(auth)
        .send({items: Array.from({length: 500}, (_, i) => i)});
      expect(wide.status).toBe(400);
    });
  });

  describe('deadline', () => {
    it('503 when a handler hangs, and the app keeps serving', async () => {
      const service = application.beans.getBean(UserService);
      vi.spyOn(service, 'findAll').mockImplementation(
        () => new Promise(() => {}),
      );
      const started = Date.now();
      const response = await request(app).get('/api/v1/users');
      expect(response.status).toBe(503);
      expect(response.body.detail).toBe('Request timed out');
      expect(Date.now() - started).toBeLessThan(2000);
      vi.restoreAllMocks();
      expect((await request(app).get('/api/v1/users')).status).toBe(200);
    });
  });

  describe('cache control', () => {
    it('no-store with credentials or writes, no-cache for public reads', async () => {
      expect(
        (await request(app).get('/api/v1/users')).headers['cache-control'],
      ).toBe('no-cache');
      expect(
        (await request(app).get('/api/v1/users').set(auth)).headers[
          'cache-control'
        ],
      ).toBe('no-store');
      expect(
        (await request(app).post('/api/v2/users').set(auth).send({})).headers[
          'cache-control'
        ],
      ).toBe('no-store');
    });
  });

  describe('audit log', () => {
    it('logs who changed what, with the request id; reads are not logged', async () => {
      const info = vi.fn();
      const logger = {child: () => ({info})} as unknown as Logger;
      const mini = express();
      mini.use(RequestGuards.requestId());
      mini.use(RequestGuards.auditLog(logger));
      mini.all('/thing', (req, res) => {
        req.principal = new Principal(AuthStrategy.Jwt, 'alice');
        res.status(req.method === 'POST' ? 201 : 200).end();
      });
      await request(mini).post('/thing').set('x-request-id', 'audit-1');
      await request(mini).get('/thing');
      expect(info).toHaveBeenCalledTimes(1);
      expect(info.mock.calls[0]![0]).toMatchObject({
        requestId: 'audit-1',
        principal: 'jwt:alice',
        method: 'POST',
        path: '/thing',
        status: 201,
      });
    });
  });

  describe('idempotency keys', () => {
    it('replays the first response instead of creating twice', async () => {
      const body = user('idem@example.com');
      const first = await request(app)
        .post('/api/v2/users')
        .set(auth)
        .set('idempotency-key', 'k-1')
        .send(body);
      const retry = await request(app)
        .post('/api/v2/users')
        .set(auth)
        .set('idempotency-key', 'k-1')
        .send(body);
      expect(first.status).toBe(201);
      expect(retry.status).toBe(201);
      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(retry.body.data.id).toBe(first.body.data.id);
      expect(retry.headers.location).toBe(first.headers.location);
      const list = await request(app)
        .get('/api/v2/users?search=idem@')
        .set(auth);
      expect(list.body.data.total).toBe(1);
    });

    it('422 when the key is reused for a different request', async () => {
      await request(app)
        .post('/api/v2/users')
        .set(auth)
        .set('idempotency-key', 'k-2')
        .send(user('a2@example.com'));
      const reused = await request(app)
        .post('/api/v2/users')
        .set(auth)
        .set('idempotency-key', 'k-2')
        .send(user('b2@example.com'));
      expect(reused.status).toBe(422);
    });

    it('keys are per caller: another caller with the same key is a new request', async () => {
      const other = `Bearer ${await application.beans.getBean(TokenProvider).createToken('other', TestApp.ALL_SCOPES)}`;
      await request(app)
        .post('/api/v2/users')
        .set(auth)
        .set('idempotency-key', 'k-3')
        .send(user('c3@example.com'));
      const second = await request(app)
        .post('/api/v2/users')
        .set('authorization', other)
        .set('idempotency-key', 'k-3')
        .send(user('d3@example.com'));
      expect(second.status).toBe(201);
      expect(second.headers['idempotent-replayed']).toBeUndefined();
    });

    it('fails closed when the store is down', async () => {
      vi.spyOn(application.beans.getBean(CacheStore), 'get').mockRejectedValue(
        new Error('down'),
      );
      const response = await request(app)
        .post('/api/v2/users')
        .set(auth)
        .set('idempotency-key', 'k-4')
        .send(user('e4@example.com'));
      expect(response.status).toBe(503);
      vi.restoreAllMocks();
    });
  });
});
