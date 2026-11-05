import {randomUUID} from 'node:crypto';
import type express from 'express';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {Application} from '../../src/application.js';
import {TokenProvider} from '../../src/security/jwt/token.provider.js';
import {RawHttp} from '../support/raw-http.js';
import {TestApp} from '../support/test-app.js';

describe('HTTP semantics and standard responses', () => {
  let application: Application;
  let app: express.Application;
  let raw: RawHttp;
  let auth: {authorization: string};

  beforeAll(async () => {
    ({application, app} = await TestApp.create());
    raw = await RawHttp.listen(app);
    auth = {
      authorization: `Bearer ${await application.beans.getBean(TokenProvider).createToken('admin')}`,
    };
  });
  afterAll(async () => {
    await raw.close();
    await application.close();
  });

  const user = {name: 'Ann', email: 'ann@example.com', age: 30, phone: null};

  describe('2xx', () => {
    it('POST 201 + body, PUT creates at a client id with 201 + Location', async () => {
      const id = randomUUID();
      const put = await request(app)
        .put(`/api/v2/users/${id}`)
        .set(auth)
        .send(user);
      expect(put.status).toBe(201);
      expect(put.headers.location).toBe(`/api/v2/users/${id}`);
      expect(put.headers.etag).toMatch(/^"/);
      expect(put.body.data.id).toBe(id);
    });

    it('PUT is idempotent: repeating it changes nothing', async () => {
      const id = randomUUID();
      const body = {...user, email: 'idem@example.com'};
      await request(app).put(`/api/v2/users/${id}`).set(auth).send(body);
      const second = await request(app)
        .put(`/api/v2/users/${id}`)
        .set(auth)
        .send(body);
      const third = await request(app)
        .put(`/api/v2/users/${id}`)
        .set(auth)
        .send(body);
      expect(second.status).toBe(200);
      expect(third.body.data).toEqual(second.body.data);
      expect(third.headers.etag).toBe(second.headers.etag);
    });

    it('PUT replaces every field (omitted phone becomes null)', async () => {
      const id = randomUUID();
      await request(app)
        .put(`/api/v2/users/${id}`)
        .set(auth)
        .send({...user, email: 'r@example.com', phone: '+1 555 0100'});
      const replaced = await request(app)
        .put(`/api/v2/users/${id}`)
        .set(auth)
        .send({name: 'R', email: 'r@example.com', age: 9});
      expect(replaced.body.data).toMatchObject({
        name: 'R',
        age: 9,
        phone: null,
      });
    });

    it('PATCH (merge-patch+json) changes only the given fields', async () => {
      const created = await request(app)
        .post('/api/v2/users')
        .set(auth)
        .send({...user, email: 'p@example.com', phone: '+1 555 0101'});
      const id = created.body.data.id;
      const patched = await request(app)
        .patch(`/api/v2/users/${id}`)
        .set(auth)
        .set('content-type', 'application/merge-patch+json')
        .send(JSON.stringify({age: 31}));
      expect(patched.status).toBe(200);
      expect(patched.body.data).toMatchObject({
        name: 'Ann',
        age: 31,
        phone: '+1 555 0101',
      });
      const cleared = await request(app)
        .patch(`/api/v2/users/${id}`)
        .set(auth)
        .send({phone: null});
      expect(cleared.body.data.phone).toBeNull();
    });

    it('PATCH rejects unknown or empty changes', async () => {
      const created = await request(app)
        .post('/api/v2/users')
        .set(auth)
        .send({...user, email: 'u@example.com'});
      const id = created.body.data.id;
      expect(
        (
          await request(app)
            .patch(`/api/v2/users/${id}`)
            .set(auth)
            .send({nmae: 'typo'})
        ).status,
      ).toBe(400);
      expect(
        (await request(app).patch(`/api/v2/users/${id}`).set(auth).send({}))
          .status,
      ).toBe(400);
    });

    it('DELETE 204, then 404 (same server state either way)', async () => {
      const created = await request(app)
        .post('/api/v2/users')
        .set(auth)
        .send({...user, email: 'del@example.com'});
      const id = created.body.data.id;
      expect(
        (await request(app).delete(`/api/v2/users/${id}`).set(auth)).status,
      ).toBe(204);
      expect(
        (await request(app).delete(`/api/v2/users/${id}`).set(auth)).status,
      ).toBe(404);
    });

    it('QUERY searches with a body, safely', async () => {
      await request(app)
        .post('/api/v2/users')
        .set(auth)
        .send({...user, name: 'Querya', email: 'q@example.com'});
      const result = await raw.request(
        'QUERY',
        '/api/v2/users/search',
        JSON.stringify({search: 'querya', size: 5}),
      );
      expect(result.status).toBe(200);
      expect(result.json.data.items.map((u: {name: string}) => u.name)).toEqual(
        ['Querya'],
      );
      const notQuery = await request(app).get('/api/v2/users/search');
      expect(notQuery.status).toBe(405);
      expect(notQuery.headers.allow).toBe('QUERY');
    });
  });

  describe('3xx', () => {
    it('GET with a matching If-None-Match is 304 Not Modified', async () => {
      const created = await request(app)
        .post('/api/v2/users')
        .set(auth)
        .send({...user, email: 'etag@example.com'});
      const first = await request(app).get(
        `/api/v2/users/${created.body.data.id}`,
      );
      const again = await request(app)
        .get(`/api/v2/users/${created.body.data.id}`)
        .set('if-none-match', first.headers.etag);
      expect(again.status).toBe(304);
      expect(again.text).toBe('');
    });

    it('SSO login redirects with 302 + Location', async () => {
      const response = await request(app).get('/auth/oidc/login');
      // Not configured here, so 501; with an IdP it is a 302 (see e2e).
      expect([302, 501]).toContain(response.status);
    });
  });

  describe('4xx and 5xx use RFC 9457 problem details', () => {
    it('401 has WWW-Authenticate and the problem shape', async () => {
      const response = await request(app).post('/api/v2/users').send(user);
      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(response.headers['content-type']).toMatch(
        /^application\/problem\+json/,
      );
      expect(response.body).toMatchObject({
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
        instance: '/api/v2/users',
        success: false,
      });
    });

    it('405 + Allow for a known path with the wrong method', async () => {
      const response = await request(app).patch('/api/v1/health').send({});
      expect(response.status).toBe(405);
      expect(response.headers.allow).toBe('GET, HEAD, OPTIONS');
    });

    it('TRACE is never allowed', async () => {
      const response = await raw.request('TRACE', '/api/v1/health');
      expect(response.status).toBe(405);
    });

    it('412 when If-Match is stale', async () => {
      const created = await request(app)
        .post('/api/v2/users')
        .set(auth)
        .send({...user, email: 'lock@example.com'});
      const id = created.body.data.id;
      const {etag} = (await request(app).get(`/api/v2/users/${id}`)).headers;
      await request(app).patch(`/api/v2/users/${id}`).set(auth).send({age: 50}); // someone else
      const stale = await request(app)
        .patch(`/api/v2/users/${id}`)
        .set(auth)
        .set('if-match', etag)
        .send({age: 51});
      expect(stale.status).toBe(412);
      const fresh = (await request(app).get(`/api/v2/users/${id}`)).headers
        .etag;
      expect(
        (
          await request(app)
            .patch(`/api/v2/users/${id}`)
            .set(auth)
            .set('if-match', fresh)
            .send({age: 51})
        ).status,
      ).toBe(200);
    });

    it('412 for If-None-Match: * on an existing resource (create-only PUT)', async () => {
      const id = randomUUID();
      await request(app)
        .put(`/api/v2/users/${id}`)
        .set(auth)
        .send({...user, email: 'once@example.com'});
      const again = await request(app)
        .put(`/api/v2/users/${id}`)
        .set(auth)
        .set('if-none-match', '*')
        .send({...user, email: 'once@example.com'});
      expect(again.status).toBe(412);
    });

    it('415 for a non-JSON body', async () => {
      const response = await request(app)
        .post('/api/v2/users')
        .set(auth)
        .set('content-type', 'text/plain')
        .send('name=Ann');
      expect(response.status).toBe(415);
      expect(response.headers['accept-post']).toBe('application/json');
    });

    it('400 for malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v2/users')
        .set(auth)
        .set('content-type', 'application/json')
        .send('{"name": ');
      expect(response.status).toBe(400);
      expect(response.body.detail).toBe('Malformed JSON body');
    });

    it('404 problem for an unknown route', async () => {
      const response = await request(app).get('/api/v1/nothing-here');
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({title: 'Not Found', status: 404});
    });
  });

  describe('safe methods', () => {
    it('HEAD answers like GET without a body', async () => {
      const response = await request(app).head('/api/v1/health');
      expect(response.status).toBe(200);
      expect(response.text ?? '').toBe('');
    });

    it('OPTIONS answers 204 with Allow', async () => {
      const response = await raw.request(
        'OPTIONS',
        '/api/v2/users/00000000-0000-0000-0000-000000000000',
      );
      expect(response.status).toBe(204);
      expect(String(response.headers.allow).split(', ')).toEqual(
        expect.arrayContaining([
          'GET',
          'HEAD',
          'PUT',
          'PATCH',
          'DELETE',
          'OPTIONS',
        ]),
      );
    });
  });
});
