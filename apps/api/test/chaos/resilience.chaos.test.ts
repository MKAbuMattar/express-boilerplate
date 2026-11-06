import {createHmac} from 'node:crypto';
import {CacheStore} from '@express-boilerplate/common/config/cache/cache-store.js';
import {TokenProvider} from '@express-boilerplate/common/security/jwt/token.provider.js';
import {UserRepository} from '@express-boilerplate/persistence/repository/user.repository.js';
import request from 'supertest';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {Application} from '../../src/application.js';
import {HttpsClient} from '../support/https-client.js';
import {TestApp} from '../support/test-app.js';

/**
 * Chaos testing: break a dependency on purpose and check the app degrades
 * cleanly. A clean failure is a fast, JSON, correctly coded answer (503 for
 * "try later", 401 for "cannot verify you") and a process that recovers.
 */
describe('Chaos: dependencies fail, the app degrades cleanly', () => {
  let application: Application | undefined;
  afterEach(async () => {
    vi.restoreAllMocks();
    await application?.close().catch(() => {});
    application = undefined;
  });

  const boot = async (env: Record<string, string> = {}) => {
    const booted = await TestApp.create(env);
    application = booted.application;
    return booted;
  };
  const timed = async (promise: PromiseLike<request.Response>) => {
    const started = Date.now();
    const response = await promise;
    return {response, ms: Date.now() - started};
  };

  it('database down: 503 on health and queries, then recovers', async () => {
    const {application: appCtx, app} = await boot();
    const dataSource = appCtx.beans.getBean(
      (
        await import(
          '@express-boilerplate/persistence/config/database.config.js'
        )
      ).DataSource,
    );
    await dataSource.destroy();

    const health = await request(app).get('/api/health');
    expect(health.status).toBe(503);
    const users = await request(app).get('/api/users');
    expect(users.status).toBe(503);
    expect(users.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(users.headers['retry-after']).toBe('5');
    expect(users.body).toMatchObject({
      type: 'about:blank',
      title: 'Service Unavailable',
      status: 503,
      success: false,
      message: 'Service Unavailable',
      data: null,
    });

    await dataSource.initialize();
    expect((await request(app).get('/api/health')).status).toBe(200);
    expect((await request(app).get('/api/users')).status).toBe(200);
  });

  it('cache down: reads and writes still work (fail open)', async () => {
    const {application: appCtx, app} = await boot();
    const store = appCtx.beans.getBean(CacheStore);
    for (const method of ['get', 'set', 'delete'] as const) {
      vi.spyOn(store, method).mockRejectedValue(new Error('ECONNREFUSED'));
    }
    const token = await appCtx.beans
      .getBean(TokenProvider)
      .createToken('chaos', TestApp.ALL_SCOPES);
    const created = await request(app)
      .post('/api/users')
      .auth(token, {type: 'bearer'})
      .send({name: 'C', email: 'c@example.com', age: 1});
    expect(created.status).toBe(201);
    const list = await request(app).get('/api/users');
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
  });

  it('cache hangs: requests still answer within the cache timeout', async () => {
    const {application: appCtx, app} = await boot({CACHE_TIMEOUT_MS: '100'});
    const store = appCtx.beans.getBean(CacheStore);
    vi.spyOn(store, 'get').mockImplementation(() => new Promise(() => {}));
    vi.spyOn(store, 'set').mockImplementation(() => new Promise(() => {}));
    const {response, ms} = await timed(request(app).get('/api/users'));
    expect(response.status).toBe(200);
    expect(ms).toBeLessThan(1000);
  });

  // @feature:auth-hmac
  it('cache down: HMAC fails closed with 503, never skips the replay check', async () => {
    const {application: appCtx, app} = await boot();
    vi.spyOn(appCtx.beans.getBean(CacheStore), 'setIfAbsent').mockRejectedValue(
      new Error('ECONNREFUSED'),
    );
    const ts = String(Math.floor(Date.now() / 1000));
    const body = '{}';
    const response = await request(app)
      .post('/api/secure/hmac')
      .set('content-type', 'application/json')
      .set('x-client-id', 'partner-a')
      .set('x-timestamp', ts)
      .set(
        'x-signature',
        createHmac('sha256', TestApp.HMAC_SECRET)
          .update(`${ts}\nPOST\n/api/secure/hmac\n${body}`)
          .digest('hex'),
      )
      .send(body);
    expect(response.status).toBe(503);
  });
  // @end:auth-hmac

  // @feature:auth-oidc
  it('OIDC provider down: 503, and still 503 (not stuck) on retry', async () => {
    const deadPort = await HttpsClient.freePort();
    const {app} = await boot({
      OIDC_ISSUER: `https://localhost:${deadPort}`,
      OIDC_CLIENT_ID: 'c',
      OIDC_CLIENT_SECRET: 's',
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      const {response, ms} = await timed(request(app).get('/auth/oidc/login'));
      expect(response.status).toBe(503);
      expect(ms).toBeLessThan(5000);
    }
  });
  // @end:auth-oidc

  // @feature:auth-oauth2
  it('OAuth2 JWKS down: 401 (fail closed) within the JWKS timeout', async () => {
    const deadPort = await HttpsClient.freePort();
    const {app} = await boot({
      OAUTH2_ISSUER: 'https://idp.example',
      OAUTH2_AUDIENCE: 'api',
      OAUTH2_JWKS_URI: `https://localhost:${deadPort}/jwks`,
    });
    const token = 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImsxIn0.eyJzdWIiOiJ4In0.c2ln';
    const {response, ms} = await timed(
      request(app).get('/api/secure/oauth2').auth(token, {type: 'bearer'}),
    );
    expect(response.status).toBe(401);
    expect(ms).toBeLessThan(5000);
  });
  // @end:auth-oauth2

  it('flaky repository: every request gets an answer, the app keeps serving', async () => {
    const {application: appCtx, app} = await boot();
    const repository = appCtx.beans.getBean(UserRepository);
    const original = repository.findAll.bind(repository);
    let call = 0;
    vi.spyOn(repository, 'findAll').mockImplementation(() =>
      call++ % 2 === 0 ? Promise.reject(new Error('random fault')) : original(),
    );
    // Cache off the path so every request reaches the repository.
    vi.spyOn(appCtx.beans.getBean(CacheStore), 'get').mockResolvedValue(null);
    const statuses = await Promise.all(
      Array.from({length: 20}, () =>
        request(app)
          .get('/api/users')
          .then((r) => r.status),
      ),
    );
    expect(new Set(statuses)).toEqual(new Set([200, 500]));
    vi.restoreAllMocks();
    expect((await request(app).get('/api/users')).status).toBe(200);
  });

  it('burst: 300 concurrent mixed requests all answer correctly', async () => {
    const {app} = await boot();
    const plan = Array.from(
      {length: 300},
      (_, i) =>
        [
          ['/api/health', 200],
          ['/api/users', 200],
          ['/api/secure/public', 200],
          ['/api/secure/jwt', 401],
          ['/missing', 404],
        ][i % 5] as [string, number],
    );
    const results = await Promise.all(
      plan.map(([path]) =>
        request(app)
          .get(path)
          .then((r) => r.status),
      ),
    );
    expect(results).toEqual(plan.map(([, status]) => status));
  });
});
