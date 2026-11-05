import http, {createServer, type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {Tracing} from '../../src/config/observability/tracing.js';

/** Own file: the OpenTelemetry SDK registers process-wide globals. */
describe('Tracing (OpenTelemetry)', () => {
  let collector: Server;
  const received: {url: string; bytes: number}[] = [];
  const saved = {...process.env};

  beforeAll(async () => {
    collector = createServer((req, res) => {
      let bytes = 0;
      req.on('data', (c: Buffer) => (bytes += c.length));
      req.on('end', () => {
        received.push({url: req.url ?? '', bytes});
        res.end('{}');
      });
    });
    await new Promise<void>((r) => collector.listen(0, '127.0.0.1', r));
  });
  afterAll(() => {
    process.env = saved;
    collector.close();
  });

  it('is off without an OTLP endpoint', () => {
    expect(Tracing.start({})).toBe(false);
  });

  it('exports a span per HTTP request to the OTLP endpoint', async () => {
    const port = (collector.address() as AddressInfo).port;
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = `http://127.0.0.1:${port}`;
    expect(Tracing.start(process.env)).toBe(true);

    const app = http.createServer((_req, res) => res.end('ok'));
    await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
    const appPort = (app.address() as AddressInfo).port;
    await new Promise<void>((resolve) =>
      http.get(`http://127.0.0.1:${appPort}/api/v1/users`, (res) => {
        res.resume();
        res.on('end', resolve);
      }),
    );
    app.close();
    await Tracing.stop(); // flushes

    const traces = received.filter((r) => r.url === '/v1/traces');
    expect(traces.length).toBeGreaterThan(0);
    expect(traces[0]!.bytes).toBeGreaterThan(0);
  });
});
