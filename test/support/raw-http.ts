import http from 'node:http';
import type {AddressInfo} from 'node:net';
import type express from 'express';

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
 * Plain-HTTP server around the app for methods supertest cannot send (QUERY)
 * and for transports that need a real socket (WebSocket upgrades, SSE).
 */
export class RawHttp {
  private constructor(readonly server: http.Server) {}

  static async listen(app: express.Application): Promise<RawHttp> {
    const server = http.createServer(app);
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
      const request = http.request(
        {
          host: '127.0.0.1',
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
