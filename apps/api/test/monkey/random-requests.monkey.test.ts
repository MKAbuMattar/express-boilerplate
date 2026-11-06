import type express from 'express';
import fc from 'fast-check';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {Application} from '../../src/application.js';
import {TestApp} from '../support/test-app.js';

/**
 * Monkey testing: throw random methods, paths, headers and bodies at the app.
 * Whatever arrives, the answer is a JSON envelope with no unexpected 5xx,
 * and the app keeps serving afterwards.
 */
describe('Monkey: random requests never cause a 5xx', () => {
  let application: Application;
  let app: express.Application;

  beforeAll(async () => {
    ({application, app} = await TestApp.create({
      EXPERIMENTS: 'new-checkout:50',
    }));
  });
  afterAll(() => application.close());

  const knownPaths = [
    '/api/health',
    '/api/users',
    '/api/users/123',
    '/api/users/00000000-0000-0000-0000-000000000000',
    '/api/secure/public',
    '/api/secure/mtls',
    '/api/secure/hmac',
    '/api/secure/jwt',
    '/api/secure/oauth2',
    '/api/secure/sso',
    '/api/experiments',
    '/api/experiments/new-checkout',
    '/auth/me',
    '/auth/logout',
    '/auth/oidc/login',
    '/auth/oidc/callback',
    '/auth/saml/login',
    '/auth/saml/acs',
    '/auth/saml/metadata',
    '/api/v1/health',
    '/api/v1/users',
    '/api/v2/users',
    '/api/v2/users?page=2&size=1',
    '/api/v2/users?search=%25',
    '/api/v2/users/search',
    '/api/v2/users/00000000-0000-4000-8000-000000000000',
    '/api/v1/network/ping',
    '/api/v1/queues',
    '/api/v1/queues/demo/jobs',
    '/api/v1/queues/demo/dead-letters',
  ];

  const path = fc.oneof(
    fc.constantFrom(...knownPaths),
    fc
      .tuple(fc.constantFrom(...knownPaths), fc.webSegment())
      .map(([base, extra]) => `${base}/${extra}`),
    fc.webPath().map((p) => p || '/'),
  );
  const method = fc.constantFrom(
    'get',
    'post',
    'put',
    'patch',
    'delete',
    'head',
    'options',
  );
  const junk = fc.oneof(
    fc.string({maxLength: 200}),
    fc.constant('Bearer'),
    fc.constant('Bearer a.b.c'),
    fc.base64String({maxLength: 300}).map((s) => `Bearer ${s}`),
  );
  const headers = fc.record(
    {
      authorization: junk,
      cookie: fc.oneof(
        fc.string({maxLength: 100}),
        fc.string().map((s) => `session=${s}`),
        fc.string().map((s) => `oidc_state=${s}; ab_id=${s}`),
      ),
      'x-client-id': fc.string({maxLength: 50}),
      'x-timestamp': fc.oneof(fc.string(), fc.integer().map(String)),
      'x-signature': fc.stringMatching(/^[0-9a-f]{0,64}$/),
    },
    {requiredKeys: []},
  );
  const body = fc.oneof(
    fc.constant(undefined),
    fc.jsonValue().map((v) => ({type: 'json', raw: JSON.stringify(v)})),
    fc.string({maxLength: 300}).map((s) => ({type: 'json', raw: s})),
    fc.string({maxLength: 300}).map((s) => ({type: 'form', raw: s})),
  );

  it('answers JSON without an unexpected 5xx for 1500 random requests', async () => {
    await fc.assert(
      fc.asyncProperty(method, path, headers, body, async (m, p, h, b) => {
        let req = request(app)[m](encodeURI(p));
        for (const [name, value] of Object.entries(h)) {
          // supertest rejects header values Node would never send.
          if (/^[\t\x20-\x7e]*$/.test(value)) req = req.set(name, value);
        }
        if (b) {
          req = req
            .set(
              'content-type',
              b.type === 'json'
                ? 'application/json'
                : 'application/x-www-form-urlencoded',
            )
            .send(b.raw);
        }
        const response = await req;
        const redirect = response.status >= 300 && response.status < 400;
        // 501 is the deliberate answer for an auth strategy with no config.
        const unexpected5xx = response.status >= 500 && response.status !== 501;
        expect(
          unexpected5xx,
          `${m.toUpperCase()} ${p} -> ${response.status}`,
        ).toBe(false);
        // HEAD, OPTIONS, 204 and 304 carry no body by definition.
        const bodyless =
          m === 'head' ||
          m === 'options' ||
          [204, 304].includes(response.status);
        if (!redirect && !bodyless && !p.includes('/saml/metadata')) {
          expect(
            response.headers['content-type'],
            `${m.toUpperCase()} ${p}`,
          ).toMatch(/json/);
        }
      }),
      {numRuns: 1500},
    );
    // Still healthy after the barrage.
    expect((await request(app).get('/api/health')).status).toBe(200);
  });
});
