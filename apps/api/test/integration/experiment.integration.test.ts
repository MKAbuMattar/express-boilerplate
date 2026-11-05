import {AuthStrategy} from '@express-boilerplate/common/enumeration/auth-strategy.enum.js';
import {Principal} from '@express-boilerplate/common/security/principal.js';
import {SessionService} from '@express-boilerplate/common/security/sso/session.service.js';
import type express from 'express';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {Application} from '../../src/application.js';
import {TestApp} from '../support/test-app.js';

describe('ExperimentV1Resource (A/B over HTTP)', () => {
  let application: Application;
  let app: express.Application;

  beforeAll(async () => {
    ({application, app} = await TestApp.create({
      EXPERIMENTS: 'new-checkout:50,all-a:100',
    }));
  });
  afterAll(() => application.close());

  it('lists configured experiments', async () => {
    const response = await request(app).get('/api/experiments');
    expect(response.body.data).toEqual(['new-checkout', 'all-a']);
  });

  it('gives a visitor a cookie and the same variant on every request', async () => {
    const first = await request(app).get('/api/experiments/new-checkout');
    expect(first.status).toBe(200);
    expect(['A', 'B']).toContain(first.body.data.variant);
    expect(first.headers['x-experiment-variant']).toBe(first.body.data.variant);
    const cookie = String(first.headers['set-cookie']).split(';')[0]!;
    expect(cookie).toMatch(/^ab_id=/);

    for (let i = 0; i < 10; i++) {
      const again = await request(app)
        .get('/api/experiments/new-checkout')
        .set('cookie', cookie);
      expect(again.body.data.variant).toBe(first.body.data.variant);
      expect(again.headers['set-cookie']).toBeUndefined();
    }
  });

  it('splits many visitors roughly evenly', async () => {
    const counts = {A: 0, B: 0} as Record<string, number>;
    for (let i = 0; i < 400; i++) {
      const response = await request(app).get('/api/experiments/new-checkout');
      counts[response.body.data.variant]!++;
    }
    expect(counts.A).toBeGreaterThan(140);
    expect(counts.B).toBeGreaterThan(140);
  });

  it('uses the SSO subject for signed-in users', async () => {
    let cookie = '';
    await application.beans
      .getBean(SessionService)
      .start(
        {cookie: (n: string, v: string) => (cookie = `${n}=${v}`)} as never,
        new Principal(AuthStrategy.Oidc, 'alice'),
      );
    const response = await request(app)
      .get('/api/experiments/all-a')
      .set('cookie', cookie);
    expect(response.body.data.variant).toBe('A');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('ignores a forged ab_id cookie (it is signed)', async () => {
    const response = await request(app)
      .get('/api/experiments/new-checkout')
      .set('cookie', 'ab_id=forged-value');
    expect(String(response.headers['set-cookie'])).toMatch(/^ab_id=s%3A/);
  });

  it('returns 404 JSON for an unknown experiment', async () => {
    const response = await request(app).get('/api/experiments/nope');
    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });
});
