import {readFileSync} from 'node:fs';
import type http from 'node:http';
import https from 'node:https';
import type {AddressInfo} from 'node:net';
import {join} from 'node:path';
import {AppConfig} from '@express-boilerplate/common/config/app.config.js';
import {TlsConfig} from '@express-boilerplate/common/config/tls.config.js';
import type express from 'express';
import {TestApp} from './test-app.js';

export class RawResult {
  constructor(
    readonly status: number,
    readonly headers: http.IncomingHttpHeaders,
    readonly text: string,
  ) {}

  get json(): any {
    try {
      return JSON.parse(this.text);
    } catch {
      return undefined;
    }
  }
}

/**
 * HTTPS server around the app, built with the production TLS options, for
 * methods supertest cannot send (QUERY) and for transports that need a real
 * socket (WebSocket upgrades, SSE, TCP over ALPN).
 */
export class RawHttp {
  /** CA that signed the server cert; clients pass it to trust the server. */
  readonly ca: Buffer;

  private constructor(readonly server: https.Server) {
    this.ca = readFileSync(join(TestApp.certs(), 'ca.crt'));
  }

  static async listen(app: express.Application): Promise<RawHttp> {
    const dir = TestApp.certs();
    const tls = TlsConfig.serverOptions(
      new AppConfig({
        NODE_ENV: 'test',
        TCP_ENABLED: 'true',
        TLS_KEY_FILE: join(dir, 'server.key'),
        TLS_CERT_FILE: join(dir, 'server.crt'),
        TLS_CA_FILE: join(dir, 'ca.crt'),
      }),
    );
    const server = https.createServer(tls, app);
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    return new RawHttp(server);
  }

  get port(): number {
    return (this.server.address() as AddressInfo).port;
  }

  request(
    method: string,
    path: string,
    body?: string,
    headers: Record<string, string> = {},
  ): Promise<RawResult> {
    return new Promise((resolve, reject) => {
      const request = https.request(
        {
          host: '127.0.0.1',
          ca: this.ca,
          port: this.port,
          method,
          path,
          headers: {
            ...(body !== undefined && {
              'content-type': 'application/json',
              'content-length': String(Buffer.byteLength(body)),
            }),
            ...headers,
          },
        },
        (response) => {
          let text = '';
          response.on('data', (chunk) => (text += chunk));
          response.on('end', () =>
            resolve(
              new RawResult(response.statusCode ?? 0, response.headers, text),
            ),
          );
        },
      );
      request.on('error', reject);
      if (body !== undefined) request.write(body);
      request.end();
    });
  }

  close(): Promise<void> {
    this.server.closeAllConnections();
    return new Promise((resolve) => this.server.close(() => resolve()));
  }
}
