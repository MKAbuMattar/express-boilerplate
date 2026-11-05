import type {RequestHandler} from 'express';
import {collectDefaultMetrics, Histogram, Registry} from 'prom-client';

/**
 * Prometheus metrics: Node runtime (event loop lag, heap, GC) and one
 * histogram of HTTP request duration by method, route pattern and status.
 *
 * The route label is the pattern (/api/v2/users/:id), never the raw URL,
 * so ids cannot explode the number of series.
 */
export class Metrics {
  readonly registry = new Registry();
  private readonly duration: Histogram<'method' | 'route' | 'status'>;

  constructor() {
    collectDefaultMetrics({register: this.registry});
    this.duration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });
  }

  middleware(): RequestHandler {
    return (request, response, next) => {
      const stop = this.duration.startTimer();
      response.on('finish', () => {
        const pattern = request.route?.path;
        stop({
          method: request.method,
          route: pattern ? `${request.baseUrl}${pattern}` : 'unmatched',
          status: String(response.statusCode),
        });
      });
      next();
    };
  }

  /** GET /metrics in the Prometheus text format. */
  handler(): RequestHandler {
    return async (_request, response) => {
      response
        .type(this.registry.contentType)
        .setHeader('Cache-Control', 'no-store')
        .send(await this.registry.metrics());
    };
  }
}
