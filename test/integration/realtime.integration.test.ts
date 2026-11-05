import dgram from 'node:dgram';
import http from 'node:http';
import net from 'node:net';
import type express from 'express';
import request from 'supertest';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {WebSocket} from 'ws';
import type {Application} from '../../src/application.js';
import {AuthStrategy} from '../../src/enumeration/auth-strategy.enum.js';
import {TokenProvider} from '../../src/security/jwt/token.provider.js';
import {Principal} from '../../src/security/principal.js';
import {SessionService} from '../../src/security/sso/session.service.js';
import {TcpServer} from '../../src/transport/tcp.server.js';
import {UdpServer} from '../../src/transport/udp.server.js';
import {RawHttp} from '../support/raw-http.js';
import {TestApp} from '../support/test-app.js';

describe('Realtime transports: SSE, WebSocket, TCP, UDP', () => {
  let application: Application;
  let app: express.Application;
  let raw: RawHttp;
  let token: string;

  beforeAll(async () => {
    ({application, app} = await TestApp.create({
      TCP_ENABLED: 'true',
      UDP_ENABLED: 'true',
      PUBLIC_URL: 'https://app.example',
    }));
    raw = await RawHttp.listen(app);
    application.beans
      .getBean(
        (await import('../../src/transport/websocket.gateway.js'))
          .WebSocketGateway,
      )
      .attach(raw.server);
    await application.beans.getBean(TcpServer).start(0);
    await application.beans.getBean(UdpServer).start(0);
    token = await application.beans
      .getBean(TokenProvider)
      .createToken('rt-user');
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
        const req = http.get(
          {
            host: '127.0.0.1',
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

  describe('WebSocket', () => {
    const open = (path: string, headers: Record<string, string> = {}) =>
      new Promise<{ws: WebSocket; messages: any[]}>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${raw.port}${path}`, {
          headers,
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

    it('accepts the SSO cookie only from an allowed Origin', async () => {
      let cookie = '';
      await application.beans
        .getBean(SessionService)
        .start(
          {cookie: (n: string, v: string) => (cookie = `${n}=${v}`)} as never,
          new Principal(AuthStrategy.Oidc, 'browser-user'),
        );
      await expect(
        open('/ws', {cookie, origin: 'https://evil.example'}),
      ).rejects.toThrow('401');
      const ok = await open('/ws', {cookie, origin: 'https://app.example'});
      expect((await next(ok.messages, 'welcome')).subject).toBe('browser-user');
      ok.ws.close();
    });
  });

  describe('TCP (newline-delimited JSON)', () => {
    const session = () => {
      const port = application.beans.getBean(TcpServer).port!;
      const socket = net.connect(port, '127.0.0.1');
      socket.setEncoding('utf8');
      const lines: any[] = [];
      let buffer = '';
      socket.on('data', (chunk: string) => {
        buffer += chunk;
        let i = buffer.indexOf('\n');
        while (i !== -1) {
          lines.push(JSON.parse(buffer.slice(0, i)));
          buffer = buffer.slice(i + 1);
          i = buffer.indexOf('\n');
        }
      });
      const send = (message: object) =>
        socket.write(`${JSON.stringify(message)}\n`);
      const waitFor = async (count: number) => {
        for (let i = 0; i < 100 && lines.length < count; i++) {
          await new Promise((r) => setTimeout(r, 20));
        }
        return lines;
      };
      return {socket, send, waitFor};
    };

    it('ping works before auth; everything else needs a JWT', async () => {
      const {socket, send, waitFor} = session();
      send({type: 'ping'});
      send({type: 'echo', text: 'x'});
      send({type: 'auth', token});
      send({type: 'whoami'});
      send({type: 'echo', text: 'x'});
      const lines = await waitFor(5);
      expect(lines.map((l) => l.type)).toEqual([
        'pong',
        'error',
        'authenticated',
        'whoami',
        'echo',
      ]);
      expect(lines[1].error).toBe('unauthorized');
      expect(lines[3].subject).toBe('rt-user');
      socket.destroy();
    });

    it('rejects a bad token and drops over-long lines', async () => {
      const {socket, send, waitFor} = session();
      send({type: 'auth', token: 'nope'});
      expect((await waitFor(1))[0].error).toBe('invalid token');
      const closed = new Promise((r) => socket.on('close', r));
      socket.write('x'.repeat(70 * 1024));
      await closed;
    });
  });

  describe('UDP (JSON datagrams)', () => {
    const exchange = (payload: string) =>
      new Promise<string | null>((resolve) => {
        const client = dgram.createSocket('udp4');
        const timer = setTimeout(() => {
          client.close();
          resolve(null);
        }, 300);
        client.on('message', (msg) => {
          clearTimeout(timer);
          client.close();
          resolve(String(msg));
        });
        client.send(
          payload,
          application.beans.getBean(UdpServer).port!,
          '127.0.0.1',
        );
      });

    it('answers ping with pong and the same id', async () => {
      const reply = await exchange(
        JSON.stringify({type: 'ping', id: 7, pad: '....'}),
      );
      expect(JSON.parse(reply!)).toEqual({type: 'pong', id: 7});
    });

    it('never amplifies: no reply larger than the request, none for junk', async () => {
      // {"type":"ping"} is 15 bytes; its pong would be 25, so nothing is sent.
      expect(await exchange('{"type":"ping"}')).toBeNull();
      // Same size is fine (amplification factor 1).
      expect(await exchange('{"type":"ping","id":12345}')).toBe(
        '{"type":"pong","id":12345}',
      );
      expect(await exchange('garbage')).toBeNull();
      expect(
        await exchange(JSON.stringify({type: 'ping', pad: 'x'.repeat(2000)})),
      ).toBeNull();
    });
  });
});
