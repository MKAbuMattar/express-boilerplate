import http from 'node:http';
import net, {type AddressInfo} from 'node:net';
import type express from 'express';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import type {Application} from '../../src/application.js';
import {CacheStore} from '../../src/config/cache/cache-store.js';
import {ServerHardening} from '../../src/config/server-hardening.js';
import {TokenProvider} from '../../src/security/jwt/token.provider.js';
import {TestApp} from '../support/test-app.js';

describe('Security: runtime hardening', () => {
  describe('rate limiting', () => {
    let application: Application;
    let app: express.Application;

    beforeAll(async () => {
      ({application, app} = await TestApp.create({
        RATE_LIMIT_ENABLED: 'true',
        RATE_LIMIT_MAX: '5',
        RATE_LIMIT_AUTH_MAX: '2',
        RATE_LIMIT_WINDOW_SECONDS: '60',
      }));
    });
    afterAll(() => application.close());

    it('allows the limit, then 429 problem details with Retry-After', async () => {
      for (let i = 0; i < 5; i++) {
        const ok = await request(app).get('/api/v1/users');
        expect(ok.status).toBe(200);
        expect(ok.headers['ratelimit-remaining']).toBe(String(4 - i));
      }
      const blocked = await request(app).get('/api/v1/users');
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect(blocked.headers['content-type']).toMatch(/problem\+json/);
      expect(blocked.body.title).toBe('Too Many Requests');
    });

    it('never limits health checks', async () => {
      for (let i = 0; i < 10; i++) {
        expect((await request(app).get('/api/v1/health')).status).toBe(200);
      }
    });

    it('has a stricter, separate bucket for /auth (brute force)', async () => {
      expect((await request(app).get('/auth/me')).status).toBe(401);
      expect((await request(app).get('/auth/me')).status).toBe(401);
      expect((await request(app).get('/auth/me')).status).toBe(429);
    });

    it('fails open when the cache is down', async () => {
      vi.spyOn(
        application.beans.getBean(CacheStore),
        'increment',
      ).mockRejectedValue(new Error('ECONNREFUSED'));
      expect((await request(app).get('/api/v1/users')).status).toBe(200);
      vi.restoreAllMocks();
    });

    it('a spoofed X-Forwarded-For does not reset the limit', async () => {
      // TRUST_PROXY is off here, so the header must be ignored entirely.
      const spoofed = await request(app)
        .get('/api/v1/users')
        .set('x-forwarded-for', '203.0.113.99');
      expect(spoofed.status).toBe(429);
    });
  });

  describe('prototype pollution', () => {
    let application: Application;
    let app: express.Application;
    let auth: {authorization: string};

    beforeAll(async () => {
      ({application, app} = await TestApp.create());
      auth = {
        authorization: `Bearer ${await application.beans.getBean(TokenProvider).createToken('sec')}`,
      };
    });
    afterAll(() => application.close());

    const polluted = () =>
      (({}) as Record<string, unknown>).polluted !== undefined ||
      Object.hasOwn(Object.prototype, 'polluted');

    it.each([
      '{"__proto__":{"polluted":true},"name":"A","email":"a@b.co","age":1}',
      '{"constructor":{"prototype":{"polluted":true}},"name":"A","email":"c@b.co","age":1}',
    ])('JSON bodies cannot pollute Object.prototype: %s', async (body) => {
      for (const [method, path] of [
        ['post', '/api/v2/users'],
        ['post', '/api/v1/queues/demo/jobs'],
        ['post', '/api/v1/network/ping'],
      ] as const) {
        await request(app)
          [method](path)
          .set(auth)
          .set('content-type', 'application/json')
          .send(body);
      }
      const created = await request(app)
        .post('/api/v2/users')
        .set(auth)
        .send({name: 'P', email: `p${Date.now()}@b.co`, age: 1});
      await request(app)
        .patch(`/api/v2/users/${created.body.data.id}`)
        .set(auth)
        .set('content-type', 'application/merge-patch+json')
        .send('{"__proto__":{"polluted":true}}');
      expect(polluted()).toBe(false);
    });

    it('query strings stay flat (no nested objects)', async () => {
      const response = await request(app).get(
        '/api/v2/users?__proto__[polluted]=1&constructor[prototype][polluted]=1&search[x]=1',
      );
      expect(response.status).toBe(200);
      expect(polluted()).toBe(false);
    });
  });

  describe('slow and oversized requests (socket level)', () => {
    let application: Application;
    let server: http.Server;
    let port: number;

    beforeAll(async () => {
      let app: express.Application;
      ({application, app} = await TestApp.create({
        HTTP_HEADERS_TIMEOUT_MS: '500',
      }));
      server = ServerHardening.apply(
        http.createServer(
          {...ServerHardening.CREATE_OPTIONS, connectionsCheckingInterval: 100},
          app,
        ),
        application.config,
      );
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve),
      );
      port = (server.address() as AddressInfo).port;
    });
    afterAll(async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await application.close();
    });

    it('cuts off a slowloris client that never finishes its headers', async () => {
      const started = Date.now();
      const reply = await new Promise<string>((resolve) => {
        const socket = net.connect(port, '127.0.0.1', () => {
          socket.write('GET /api/v1/health HTTP/1.1\r\nHost: x\r\nX-Slow: ');
        });
        let data = '';
        socket.on('data', (chunk) => (data += chunk));
        socket.on('close', () => resolve(data));
      });
      expect(reply).toMatch(/^HTTP\/1\.1 408/);
      expect(Date.now() - started).toBeLessThan(3000);
    });

    it('rejects oversized headers with 431', async () => {
      const status = await new Promise<number>((resolve) => {
        http
          .get(
            {
              host: '127.0.0.1',
              port,
              path: '/api/v1/health',
              headers: {'x-big': 'a'.repeat(20 * 1024)},
            },
            (res) => resolve(res.statusCode ?? 0),
          )
          .on('error', () => resolve(-1));
      });
      expect(status).toBe(431);
    });
  });

  describe('response headers', () => {
    it('production sends the security headers and hides the framework', async () => {
      const {application, app} = await TestApp.create({
        NODE_ENV: 'production',
        SESSION_SECRET: 'x'.repeat(40),
      });
      try {
        const response = await request(app).get('/api/v1/health');
        expect(response.headers['x-powered-by']).toBeUndefined();
        expect(response.headers['strict-transport-security']).toMatch(
          /max-age=\d+/,
        );
        expect(response.headers['content-security-policy']).toMatch(
          /default-src 'self'/,
        );
        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
        expect(response.headers['cross-origin-opener-policy']).toBe(
          'same-origin',
        );
        expect((await request(app).get('/docs')).status).toBe(404);
      } finally {
        await application.close();
      }
    });
  });
});
