import type {
  Application,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from 'express';
import {ProblemDetails} from '../../exceptions/problem-details.js';

type RouteLayer = {
  route?: {methods: Record<string, boolean>};
  match(path: string): boolean;
};

/**
 * HTTP method semantics the router does not give for free (RFC 9110):
 * - OPTIONS answers 204 with an Allow header (CORS preflights stay with cors),
 * - a known path with an unsupported method is 405 + Allow, not 404,
 * - bodies on /api must be JSON (415 otherwise),
 * - TRACE is never allowed (cross-site tracing).
 * GET also answers HEAD, and Express turns a matching If-None-Match into 304.
 */
export class HttpSemantics {
  private static readonly BODY_METHODS = new Set([
    'POST',
    'PUT',
    'PATCH',
    'QUERY',
  ]);
  private static readonly JSON_TYPES = /^application\/([\w.+-]+\+)?json\b/i;

  /** Methods the router serves for a path, plus HEAD and OPTIONS. */
  static allowedMethods(app: Application, path: string): string[] {
    const stack =
      (app as unknown as {router?: {stack: RouteLayer[]}}).router?.stack ?? [];
    const methods = new Set<string>();
    for (const layer of stack) {
      if (!layer.route || !layer.match(path)) continue;
      for (const [method, enabled] of Object.entries(layer.route.methods)) {
        if (!enabled) continue;
        // @All routes (used for QUERY) check their method themselves.
        methods.add(method === '_all' ? 'QUERY' : method.toUpperCase());
      }
    }
    if (methods.size === 0) return [];
    if (methods.has('GET')) methods.add('HEAD');
    methods.add('OPTIONS');
    return [...methods].sort();
  }

  static options(app: () => Application): RequestHandler {
    return (request, response, next) => {
      const preflight = request.headers['access-control-request-method'];
      if (request.method !== 'OPTIONS' || preflight) return next();
      const allowed = HttpSemantics.allowedMethods(app(), request.path);
      if (allowed.length === 0) return next();
      response.set('Allow', allowed.join(', ')).status(204).end();
    };
  }

  static jsonBodiesOnly(): RequestHandler {
    return (request, response, next) => {
      const hasBody =
        Number(request.headers['content-length'] ?? 0) > 0 ||
        request.headers['transfer-encoding'] !== undefined;
      if (
        request.path.startsWith('/api/') &&
        HttpSemantics.BODY_METHODS.has(request.method) &&
        hasBody &&
        !HttpSemantics.JSON_TYPES.test(request.headers['content-type'] ?? '')
      ) {
        ProblemDetails.send(
          response,
          415,
          'Send the body as application/json',
          request.originalUrl,
          {
            'Accept-Post': 'application/json',
            'Accept-Patch': 'application/json, application/merge-patch+json',
          },
        );
        return;
      }
      next();
    };
  }

  /**
   * Every 4xx/5xx JSON body becomes RFC 9457 problem details, whoever wrote
   * it: controllers, guards (the adapter replies to those itself), filters.
   */
  static problemResponses(): RequestHandler {
    return (request, response, next) => {
      const json = response.json.bind(response);
      response.json = (body?: unknown) => {
        const status = response.statusCode;
        if (status < 400) return json(body);
        for (const [name, value] of Object.entries(
          ProblemDetails.statusHeaders(status),
        )) {
          if (!response.getHeader(name)) response.setHeader(name, value);
        }
        const problem = ProblemDetails.isProblem(body)
          ? body
          : ProblemDetails.from(status, body, request.originalUrl);
        const requestId = response.getHeader('X-Request-Id');
        if (
          problem instanceof ProblemDetails &&
          typeof requestId === 'string'
        ) {
          problem.requestId = requestId;
        }
        response.type(ProblemDetails.CONTENT_TYPE);
        return response.send(JSON.stringify(problem));
      };
      next();
    };
  }

  /** Last route handler: 405 when the path exists with other methods, else 404. */
  static notFound(app: () => Application): RequestHandler {
    return (request, response) => {
      const allowed = HttpSemantics.allowedMethods(app(), request.path);
      if (allowed.length > 0) {
        ProblemDetails.send(
          response,
          405,
          `${request.method} is not supported here`,
          request.originalUrl,
          {Allow: allowed.join(', ')},
        );
        return;
      }
      ProblemDetails.send(response, 404, 'Not Found', request.originalUrl);
    };
  }

  /** Errors thrown before a controller runs: malformed JSON, body too large. */
  static errorHandler() {
    return (
      error: {status?: number; statusCode?: number; type?: string},
      request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      const status = error.status ?? error.statusCode ?? 500;
      const detail =
        error.type === 'entity.parse.failed'
          ? 'Malformed JSON body'
          : error.type === 'entity.too.large'
            ? 'Body too large'
            : status < 500
              ? 'Invalid request'
              : 'Internal Server Error';
      ProblemDetails.send(response, status, detail, request.originalUrl);
    };
  }
}
