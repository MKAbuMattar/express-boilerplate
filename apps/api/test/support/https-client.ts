import {readFileSync} from 'node:fs';
import https from 'node:https';
import {type AddressInfo, createServer} from 'node:net';
import {join} from 'node:path';

export class HttpsResult {
  constructor(
    readonly status: number,
    readonly headers: Record<string, string | string[] | undefined>,
    readonly text: string,
  ) {}

  get json(): any {
    try {
      return JSON.parse(this.text);
    } catch {
      return undefined;
    }
  }

  cookie(name: string): string | undefined {
    const cookies = this.headers['set-cookie'];
    return (Array.isArray(cookies) ? cookies : [])
      .map((cookie) => cookie.split(';')[0]!)
      .find((cookie) => cookie.startsWith(`${name}=`));
  }
}

/** HTTPS client that trusts the test CA and can present the client cert. */
export class HttpsClient {
  private readonly ca: Buffer;

  constructor(
    private readonly certDir: string,
    readonly port: number,
  ) {
    this.ca = readFileSync(join(certDir, 'ca.crt'));
  }

  static freePort(): Promise<number> {
    return new Promise((resolve) => {
      const probe = createServer().listen(0, () => {
        const {port} = probe.address() as AddressInfo;
        probe.close(() => resolve(port));
      });
    });
  }

  request(
    method: string,
    path: string,
    options: {
      headers?: Record<string, string>;
      body?: string | object;
      clientCert?: boolean;
      url?: URL;
      /** For a server bound to one address (RawHttp: 127.0.0.1). */
      host?: string;
    } = {},
  ): Promise<HttpsResult> {
    const {headers = {}, body, clientCert = false, url, host} = options;
    const data =
      body === undefined
        ? undefined
        : typeof body === 'string'
          ? body
          : JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const request = https.request(
        {
          host: url?.hostname ?? host ?? 'localhost',
          port: url ? Number(url.port) : this.port,
          path: url ? url.pathname + url.search : path,
          method,
          ca: this.ca,
          agent: false,
          headers: {
            ...(data !== undefined && {
              'content-type': 'application/json',
              'content-length': String(Buffer.byteLength(data)),
            }),
            ...headers,
          },
          ...(clientCert && {
            key: readFileSync(join(this.certDir, 'client.key')),
            cert: readFileSync(join(this.certDir, 'client.crt')),
          }),
        },
        (response) => {
          let text = '';
          response.on('data', (chunk) => {
            text += chunk;
          });
          response.on('end', () =>
            resolve(
              new HttpsResult(response.statusCode ?? 0, response.headers, text),
            ),
          );
        },
      );
      request.on('error', reject);
      if (data !== undefined) request.write(data);
      request.end();
    });
  }
}
