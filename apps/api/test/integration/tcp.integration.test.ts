import tls from 'node:tls';
import {TlsConfig} from '@express-boilerplate/common/config/tls.config.js';
import {TokenProvider} from '@express-boilerplate/common/security/jwt/token.provider.js';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {Application} from '../../src/application.js';
import {RawHttp} from '../support/raw-http.js';
import {TestApp} from '../support/test-app.js';

describe('TCP line protocol on the TLS port (ALPN ndjson/1)', () => {
  let application: Application;
  let raw: RawHttp;
  let token: string;

  beforeAll(async () => {
    const created = await TestApp.create({TCP_ENABLED: 'true'});
    application = created.application;
    raw = await RawHttp.listen(created.app);
    application.startTransports(raw.server);
    token = await application.beans
      .getBean(TokenProvider)
      .createToken('rt-user', TestApp.ALL_SCOPES);
  });
  afterAll(async () => {
    await application.close();
    await raw.close();
  });

  describe('TCP (newline-delimited JSON over TLS, ALPN ndjson/1)', () => {
    const session = () => {
      const socket = tls.connect({
        host: '127.0.0.1',
        port: raw.port,
        ca: raw.ca,
        ALPNProtocols: [TlsConfig.LINE_PROTOCOL],
      });
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
});
