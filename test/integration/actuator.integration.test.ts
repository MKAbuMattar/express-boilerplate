import type express from 'express';
import request from 'supertest';
import {DataSource} from 'typeorm';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import type {Application} from '../../src/application.js';
import {CacheStore} from '../../src/config/cache/cache-store.js';
import {TestApp} from '../support/test-app.js';

describe('Actuator health', () => {
  let application: Application;
  let app: express.Application;
  const MEDIA = /^application\/json/;

  beforeAll(async () => {
    ({application, app} = await TestApp.create());
  });
  afterAll(() => application.close());

  it('reports UP with one component per indicator, details hidden by default', async () => {
    const response = await request(app).get('/actuator/health');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(MEDIA);
    const body = JSON.parse(response.text);
    expect(body).toEqual({
      status: 'UP',
      components: {
        ping: {status: 'UP'},
        db: {status: 'UP'},
        cache: {status: 'UP'},
        queue: {status: 'UP'},
      },
    });
  });

  it('groups: liveness is ping only, readiness is db and cache', async () => {
    const live = JSON.parse(
      (await request(app).get('/actuator/health/liveness')).text,
    );
    const ready = JSON.parse(
      (await request(app).get('/actuator/health/readiness')).text,
    );
    expect(Object.keys(live.components)).toEqual(['ping']);
    expect(Object.keys(ready.components)).toEqual(['db', 'cache']);
  });

  it.each([
    ['/healthz', '/actuator/health'],
    ['/livez', '/actuator/health/liveness'],
    ['/readyz', '/actuator/health/readiness'],
  ])('%s is an alias of %s', async (alias, path) => {
    const a = await request(app).get(alias);
    const b = await request(app).get(path);
    expect(a.status).toBe(b.status);
    expect(a.text).toBe(b.text);
  });

  it('probes work with any Host header (kubelet uses the pod IP)', async () => {
    expect(
      (await request(app).get('/livez').set('host', '10.2.3.4:8080')).status,
    ).toBe(200);
  });

  it('database down: health and readiness 503 DOWN, liveness stays UP', async () => {
    const dataSource = application.beans.getBean(DataSource);
    await dataSource.destroy();
    try {
      const health = await request(app).get('/healthz');
      expect(health.status).toBe(503);
      const body = JSON.parse(health.text);
      expect(body.status).toBe('DOWN');
      expect(body.components.db.status).toBe('DOWN');
      expect(body.components.cache.status).toBe('UP');
      expect(health.headers['content-type']).toMatch(MEDIA); // not rewritten to problem details
      expect((await request(app).get('/readyz')).status).toBe(503);
      expect((await request(app).get('/livez')).status).toBe(200);
    } finally {
      await dataSource.initialize();
    }
  });

  it('a hung dependency is DOWN after the timeout, never a hung probe', async () => {
    vi.spyOn(application.beans.getBean(CacheStore), 'get').mockImplementation(
      () => new Promise(() => {}),
    );
    const started = Date.now();
    const response = await request(app).get('/readyz');
    vi.restoreAllMocks();
    expect(response.status).toBe(503);
    expect(JSON.parse(response.text).components.cache.status).toBe('DOWN');
    expect(Date.now() - started).toBeLessThan(3500);
  });

  it('info: app version and runtime', async () => {
    const body = JSON.parse((await request(app).get('/actuator/info')).text);
    expect(body.app.name).toBe('@mkabumattar/express-boilerplate');
    expect(body.runtime.node).toBe(process.version);
    expect(typeof body.uptimeSeconds).toBe('number');
  });

  it('prometheus is /metrics under its Actuator name', async () => {
    const response = await request(app).get('/actuator/prometheus');
    expect(response.status).toBe(200);
    expect(response.text).toContain('http_request_duration_seconds');
  });

  it('info and prometheus are limited to ops networks; health is not', async () => {
    const {application: locked, app: lockedApp} = await TestApp.create({
      OPS_ALLOWED_CIDRS: '10.0.0.0/8',
    });
    try {
      expect((await request(lockedApp).get('/actuator/info')).status).toBe(403);
      expect(
        (await request(lockedApp).get('/actuator/prometheus')).status,
      ).toBe(403);
      expect((await request(lockedApp).get('/actuator/health')).status).toBe(
        200,
      );
    } finally {
      await locked.close();
    }
  });

  it('shows details when HEALTH_SHOW_DETAILS=always', async () => {
    const {application: verbose, app: verboseApp} = await TestApp.create({
      HEALTH_SHOW_DETAILS: 'always',
    });
    try {
      const body = JSON.parse(
        (await request(verboseApp).get('/actuator/health')).text,
      );
      expect(body.components.db.details).toMatchObject({database: 'sqljs'});
      expect(typeof body.components.db.details.latencyMs).toBe('number');
      expect(body.components.cache.details).toMatchObject({type: 'memory'});
    } finally {
      await verbose.close();
    }
  });
});
