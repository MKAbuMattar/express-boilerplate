import type express from 'express';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {Application} from '../../src/application.js';
import {TestApp} from '../support/test-app.js';

/**
 * Deny by default: every route must refuse a caller with no credentials,
 * unless it is listed here as public on purpose. A new route that forgets
 * its guard fails this test, so it cannot ship open by accident.
 */
const PUBLIC_ROUTES = new Set([
  'GET /api/v1/health',
  'GET /livez',
  'GET /readyz',
  'GET /healthz',
  'GET /actuator/health',
  'GET /actuator/health/liveness',
  'GET /actuator/health/readiness',
  // Limited to OPS_ALLOWED_CIDRS; loopback is allowed here.
  'GET /actuator/info',
  // @feature:metrics
  'GET /actuator/prometheus',
  // @end:metrics
  'GET /api/v1/users',
  'GET /api/v1/users/:id',
  'GET /api/v2/users',
  'GET /api/v2/users/:id',
  'GET /api/v1/secure/public',
  // @feature:experiments
  'GET /api/v1/experiments',
  'GET /api/v1/experiments/:name',
  // @end:experiments
  // @feature:sse
  'GET /api/v1/events',
  // @end:sse
  'GET /.well-known/jwks.json',
  // @feature:metrics
  'GET /metrics', // limited to OPS_ALLOWED_CIDRS; loopback is allowed here
  // @end:metrics
  // Login flows must be reachable before login.
  // @feature:auth-oidc
  'GET /auth/oidc/login',
  'GET /auth/oidc/callback',
  // @end:auth-oidc
  // @feature:auth-saml
  'GET /auth/saml/login',
  'POST /auth/saml/acs',
  'GET /auth/saml/metadata',
  // @end:auth-saml
  // @feature:sso
  'POST /auth/logout',
  // @end:sso
]);

/** @All routes: every method, public on purpose (QUERY search; others 405). */
const PUBLIC_ANY_METHOD = new Set(['/api/v2/users/search']);
/** Node routes CONNECT to the 'connect' event, never to Express. */
const UNROUTABLE_METHODS = new Set(['CONNECT']);

describe('Security: route audit (deny by default)', () => {
  let application: Application;
  let app: express.Application;
  const routes: string[] = [];

  beforeAll(async () => {
    ({application, app} = await TestApp.create());
    const stack = (
      app as unknown as {
        router: {
          stack: {route?: {path: string; methods: Record<string, boolean>}}[];
        };
      }
    ).router.stack;
    for (const layer of stack) {
      if (!layer.route) continue;
      if (PUBLIC_ANY_METHOD.has(layer.route.path)) continue;
      for (const method of Object.keys(layer.route.methods)) {
        if (UNROUTABLE_METHODS.has(method.toUpperCase())) continue;
        routes.push(`${method.toUpperCase()} ${layer.route.path}`);
      }
    }
  });
  afterAll(() => application.close());

  it('finds the routes', () => {
    // Even the smallest generated project has users, health, actuator and auth.
    expect(routes.length).toBeGreaterThan(15);
  });

  it('every non-public route refuses an anonymous caller', async () => {
    const open: string[] = [];
    for (const route of routes) {
      if (PUBLIC_ROUTES.has(route)) continue;
      const [method, path] = route.split(' ') as [string, string];
      const url = path
        .replace(':id', '00000000-0000-4000-8000-000000000000')
        .replace(':name', 'demo');
      const response = await request(app)
        [method.toLowerCase() as 'get'](url)
        .set('content-type', 'application/json')
        .send(method === 'GET' || method === 'DELETE' ? undefined : '{}');
      // 401/403: guarded. 501: strategy not configured, still closed.
      if (![401, 403, 501].includes(response.status)) {
        open.push(`${route} -> ${response.status}`);
      }
    }
    expect(open, 'routes answering without credentials').toEqual([]);
  });

  it('the public list has no stale entries', () => {
    const stale = [...PUBLIC_ROUTES].filter((route) => !routes.includes(route));
    expect(stale).toEqual([]);
  });
});
