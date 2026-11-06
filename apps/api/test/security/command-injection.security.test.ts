import {TokenProvider} from '@express-boilerplate/common/security/jwt/token.provider.js';
import {NetworkService} from '@express-boilerplate/service/service/network.service.js';
import type express from 'express';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import type {Application} from '../../src/application.js';
import {TestApp} from '../support/test-app.js';

/**
 * Command and option injection against the ping endpoint: every payload must
 * be rejected by validation before the ping binary is ever started.
 */
describe('Security: command injection (ping)', () => {
  let application: Application;
  let app: express.Application;
  let auth: {authorization: string};

  beforeAll(async () => {
    ({application, app} = await TestApp.create());
    auth = {
      authorization: `Bearer ${await application.beans.getBean(TokenProvider).createToken('sec', TestApp.ALL_SCOPES)}`,
    };
  });
  afterAll(() => application.close());

  it.each([
    '127.0.0.1; whoami',
    '127.0.0.1 && calc',
    '127.0.0.1 | id',
    '127.0.0.1`id`',
    '$(id)',
    '127.0.0.1\nid',
    '-c 1000 127.0.0.1',
    '-f',
    '--help',
    '-w 100000 example.com',
    'example.com#',
    '../../etc/passwd',
    'a'.repeat(300),
    '',
    ' ',
  ])('rejects %j with 400 and never runs ping', async (host) => {
    const ping = vi.spyOn(application.beans.getBean(NetworkService), 'ping');
    const response = await request(app)
      .post('/api/v1/network/ping')
      .set(auth)
      .send({host});
    expect(response.status).toBe(400);
    expect(ping).not.toHaveBeenCalled();
  });

  it.each([{host: 123}, {host: ['127.0.0.1']}, {host: {toString: '1'}}, {}])(
    'rejects non-string host %j',
    async (body) => {
      const response = await request(app)
        .post('/api/v1/network/ping')
        .set(auth)
        .send(body);
      expect(response.status).toBe(400);
    },
  );
});
