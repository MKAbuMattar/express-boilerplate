import type express from 'express';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {Application} from '../../src/application.js';
import {TokenProvider} from '../../src/security/jwt/token.provider.js';
import {TestApp} from '../support/test-app.js';

describe('ICMP ping check', () => {
  let application: Application;
  let app: express.Application;
  let auth: {authorization: string};

  beforeAll(async () => {
    ({application, app} = await TestApp.create());
    auth = {
      authorization: `Bearer ${await application.beans.getBean(TokenProvider).createToken('ops', TestApp.ALL_SCOPES)}`,
    };
  });
  afterAll(() => application.close());

  it('requires a JWT', async () => {
    expect(
      (
        await request(app)
          .post('/api/v1/network/ping')
          .send({host: '127.0.0.1'})
      ).status,
    ).toBe(401);
  });

  it('pings loopback and reports latency', async () => {
    const response = await request(app)
      .post('/api/v1/network/ping')
      .set(auth)
      .send({host: '127.0.0.1'});
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      host: '127.0.0.1',
      reachable: true,
    });
    expect(typeof response.body.data.latencyMs).toBe('number');
  });

  it('reports an unreachable host as reachable: false, not an error', async () => {
    // TEST-NET-1 (RFC 5737) is reserved and never routed.
    const response = await request(app)
      .post('/api/v1/network/ping')
      .set(auth)
      .send({host: '192.0.2.1'});
    expect(response.status).toBe(200);
    expect(response.body.data.reachable).toBe(false);
  });
});
