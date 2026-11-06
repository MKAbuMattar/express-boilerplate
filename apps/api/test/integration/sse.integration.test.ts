import https from 'node:https';
import {TokenProvider} from '@express-boilerplate/common/security/jwt/token.provider.js';
import type express from 'express';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {Application} from '../../src/application.js';
import {RawHttp} from '../support/raw-http.js';
import {TestApp} from '../support/test-app.js';

describe('SSE over the TLS port', () => {
  let application: Application;
  let app: express.Application;
  let raw: RawHttp;
  let token: string;

  beforeAll(async () => {
    ({application, app} = await TestApp.create());
    raw = await RawHttp.listen(app);
    token = await application.beans
      .getBean(TokenProvider)
      .createToken('rt-user', TestApp.ALL_SCOPES);
  });
  afterAll(async () => {
    await application.close();
    await raw.close();
  });

  const createUser = (email: string) =>
    request(app)
      .post('/api/v1/users')
      .auth(token, {type: 'bearer'})
      .send({name: 'RT', email, age: 1});

  describe('SSE', () => {
    it('streams user.created to subscribers', async () => {
      const received = new Promise<string>((resolve, reject) => {
        const req = https.get(
          {
            host: '127.0.0.1',
            ca: raw.ca,
            port: raw.port,
            path: '/api/v1/events',
            headers: {accept: 'text/event-stream'},
          },
          (response) => {
            expect(response.headers['content-type']).toMatch(
              /text\/event-stream/,
            );
            let text = '';
            response.on('data', (chunk) => {
              text += chunk;
              if (text.includes('event: user.created')) {
                req.destroy();
                resolve(text);
              }
            });
          },
        );
        req.on('error', reject);
      });
      await new Promise((r) => setTimeout(r, 100)); // let the stream subscribe
      await createUser('sse@example.com');
      const text = await received;
      expect(text).toMatch(/^retry: 3000/);
      const data = JSON.parse(/data: (.+)\n/.exec(text)![1]!);
      expect(data).toMatchObject({
        type: 'user.created',
        data: {id: expect.any(String)},
      });
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('at');
    });
  });
});
