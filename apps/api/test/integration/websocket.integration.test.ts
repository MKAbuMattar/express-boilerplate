import type {AuthStrategy} from '@express-boilerplate/common/enumeration/auth-strategy.enum.js';
import {TokenProvider} from '@express-boilerplate/common/security/jwt/token.provider.js';
import {Principal} from '@express-boilerplate/common/security/principal.js';
import {SessionService} from '@express-boilerplate/common/security/sso/session.service.js';
import type express from 'express';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {WebSocket} from 'ws';
import type {Application} from '../../src/application.js';
import {RawHttp} from '../support/raw-http.js';
import {TestApp} from '../support/test-app.js';

describe('WebSocket on the TLS port', () => {
  let application: Application;
  let app: express.Application;
  let raw: RawHttp;
  let token: string;

  beforeAll(async () => {
    ({application, app} = await TestApp.create({
      PUBLIC_URL: 'https://app.example',
    }));
    raw = await RawHttp.listen(app);
    application.startTransports(raw.server);
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

  describe('WebSocket', () => {
    const open = (path: string, headers: Record<string, string> = {}) =>
      new Promise<{ws: WebSocket; messages: any[]}>((resolve, reject) => {
        const ws = new WebSocket(`wss://127.0.0.1:${raw.port}${path}`, {
          headers,
          ca: raw.ca,
        });
        const messages: any[] = [];
        ws.on('message', (data) => messages.push(JSON.parse(String(data))));
        ws.once('open', () => resolve({ws, messages}));
        ws.once('unexpected-response', (_req, res) =>
          reject(new Error(String(res.statusCode))),
        );
        ws.once('error', reject);
      });
    const next = async (messages: any[], type: string) => {
      for (let i = 0; i < 50; i++) {
        const found = messages.find((m) => m.type === type);
        if (found) return found;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error(`no ${type} message`);
    };

    it('rejects an unauthenticated upgrade with 401', async () => {
      await expect(open('/ws')).rejects.toThrow('401');
      await expect(open('/ws?access_token=forged')).rejects.toThrow('401');
    });

    it('accepts a JWT (header or query) and answers ping, echo, whoami', async () => {
      const {ws, messages} = await open('/ws', {
        authorization: `Bearer ${token}`,
      });
      expect((await next(messages, 'welcome')).subject).toBe('rt-user');
      ws.send(JSON.stringify({type: 'ping'}));
      ws.send(JSON.stringify({type: 'echo', text: 'hi'}));
      ws.send(JSON.stringify({type: 'whoami'}));
      ws.send('not json');
      expect(await next(messages, 'pong')).toHaveProperty('at');
      expect(await next(messages, 'echo')).toEqual({type: 'echo', text: 'hi'});
      expect(await next(messages, 'whoami')).toEqual({
        type: 'whoami',
        strategy: 'jwt',
        subject: 'rt-user',
      });
      expect((await next(messages, 'error')).error).toBe(
        'invalid JSON message',
      );
      ws.close();

      const viaQuery = await open(`/ws?access_token=${token}`);
      viaQuery.ws.close();
    });

    it('pushes server events and broadcasts between clients', async () => {
      const a = await open('/ws', {authorization: `Bearer ${token}`});
      const b = await open('/ws', {authorization: `Bearer ${token}`});
      a.ws.send(JSON.stringify({type: 'broadcast', data: {hello: 'all'}}));
      expect((await next(b.messages, 'broadcast')).data).toEqual({
        hello: 'all',
      });
      await createUser('ws@example.com');
      expect((await next(a.messages, 'event')).event.type).toBe('user.created');
      a.ws.close();
      b.ws.close();
    });

    // @feature:sso
    it('accepts the SSO cookie only from an allowed Origin', async () => {
      let cookie = '';
      await application.beans
        .getBean(SessionService)
        .start(
          {cookie: (n: string, v: string) => (cookie = `${n}=${v}`)} as never,
          new Principal('oidc' as AuthStrategy, 'browser-user'),
        );
      await expect(
        open('/ws', {cookie, origin: 'https://evil.example'}),
      ).rejects.toThrow('401');
      const ok = await open('/ws', {cookie, origin: 'https://app.example'});
      expect((await next(ok.messages, 'welcome')).subject).toBe('browser-user');
      ok.ws.close();
    });
    // @end:sso
  });
});
