import type express from 'express';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {Application} from '../../src/application.js';
import {TestApp} from '../support/test-app.js';

describe('Prometheus metrics', () => {
  let application: Application;
  let app: express.Application;

  beforeAll(async () => {
    ({application, app} = await TestApp.create({QUEUE_BACKOFF_MS: '5'}));
  });
  afterAll(() => application.close());

  it('exposes Prometheus metrics labelled by route pattern, not raw URL', async () => {
    await request(app).get(
      '/api/v2/users/00000000-0000-4000-8000-000000000001',
    );
    await request(app).get('/api/v1/users');
    const response = await request(app).get('/metrics');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/plain/);
    expect(response.text).toContain('process_cpu_user_seconds_total');
    expect(response.text).toMatch(
      /http_request_duration_seconds_count\{[^}]*route="\/api\/v2\/users\/:id"/,
    );
    expect(response.text).not.toContain('00000000-0000-4000-8000-000000000001');
  });

  it('serves /metrics only to allowed networks', async () => {
    const {application: locked, app: lockedApp} = await TestApp.create({
      OPS_ALLOWED_CIDRS: '10.0.0.0/8',
    });
    expect((await request(lockedApp).get('/metrics')).status).toBe(403);
    await locked.close();
  });
});
