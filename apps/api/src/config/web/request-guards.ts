import {createHash, randomUUID} from 'node:crypto';
import {BlockList, isIPv4, isIPv6} from 'node:net';
import type {AppConfig} from '@express-boilerplate/common/config/app.config.js';
import type {CacheStore} from '@express-boilerplate/common/config/cache/cache-store.js';
import {ProblemDetails} from '@express-boilerplate/common/exceptions/problem-details.js';
import type {Request, RequestHandler, Response} from 'express';
import type {Logger} from 'pino';

/**
 * Request-level protections, each a small Express middleware. Application
 * wires them in order; every rejection is RFC 9457 problem details.
 */
export class RequestGuards {
  private static readonly SAFE_METHODS = new Set([
    'GET',
    'HEAD',
    'OPTIONS',
    'QUERY',
  ]);
  /** Probes and scrapes: by IP or container name, not the public host. */
  private static readonly HEALTH =
    /^(\/api\/(v\d+\/)?health(\/|$)|\/metrics$|\/livez$|\/readyz$|\/healthz$|\/actuator\/(health|prometheus)(\/|$))/;
  private static readonly REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

  /**
   * X-Request-Id: keeps a well-formed incoming id (so a trace spans services),
   * otherwise makes one. It is echoed in the response, logged by pino-http
   * and added to problem details, so a user's error report finds the log line.
   */
  static requestId(): RequestHandler {
    return (request, response, next) => {
      const incoming = request.header('x-request-id');
      const id =
        incoming && RequestGuards.REQUEST_ID.test(incoming)
          ? incoming
          : randomUUID();
      response.setHeader('X-Request-Id', id);
      next();
    };
  }

  /**
   * Answers only for the hosts this service is (PUBLIC_URL, ALLOWED_HOSTS;
   * plus loopback outside production). Blocks Host-header injection into
   * generated links and DNS-rebinding attacks. Health checks are exempt so
   * load balancers can probe by IP.
   */
  static hostValidation(config: AppConfig): RequestHandler {
    const allowed = new Set(
      [
        new URL(config.env.PUBLIC_URL).hostname,
        ...config.env.ALLOWED_HOSTS.split(',').map((h) => h.trim()),
        ...(config.isProduction ? [] : ['localhost', '127.0.0.1', '::1']),
      ]
        .filter(Boolean)
        .map((host) => host.toLowerCase().replace(/^\[|\]$/g, '')),
    );
    return (request, response, next) => {
      if (RequestGuards.HEALTH.test(request.path)) return next();
      const host = RequestGuards.hostname(request.headers.host);
      if (host && allowed.has(host)) return next();
      ProblemDetails.send(
        response,
        host ? 421 : 400,
        host ? 'Unknown host' : 'Missing Host header',
        request.originalUrl,
      );
    };
  }

  /**
   * Cross-site request forgery guard for state-changing requests.
   * Browsers send Fetch Metadata (Sec-Fetch-Site) and Origin; a cross-site
   * write is allowed only from an allowed origin. Clients that authenticate
   * with a header and send no cookies cannot be forged and pass. The SAML ACS
   * is exempt: the IdP posts to it cross-site by design.
   */
  static crossSite(config: AppConfig): RequestHandler {
    const allowed = new Set([
      new URL(config.env.PUBLIC_URL).origin,
      ...config.corsOrigins,
    ]);
    return (request, response, next) => {
      if (
        RequestGuards.SAFE_METHODS.has(request.method) ||
        request.path === '/auth/saml/acs'
      ) {
        return next();
      }
      const site = request.header('sec-fetch-site');
      const origin = request.header('origin');
      const originAllowed = origin !== undefined && allowed.has(origin);
      const crossSite =
        site === 'cross-site' || site === 'same-site'
          ? !originAllowed
          : site === undefined &&
            origin !== undefined &&
            !originAllowed &&
            request.headers.cookie !== undefined;
      if (!crossSite) return next();
      ProblemDetails.send(
        response,
        403,
        'Cross-site request blocked',
        request.originalUrl,
      );
    };
  }

  /**
   * Operational routes (queues, network) answer only from OPS_ALLOWED_CIDRS,
   * on top of their scope checks: a leaked ops token alone is not enough.
   */
  static ipAllowlist(config: AppConfig, paths: RegExp): RequestHandler {
    const list = new BlockList();
    for (const cidr of config.env.OPS_ALLOWED_CIDRS.split(',')
      .map((c) => c.trim())
      .filter(Boolean)) {
      const [address = '', prefix = ''] = cidr.split('/');
      const type = isIPv6(address) ? 'ipv6' : 'ipv4';
      list.addSubnet(
        address,
        Number(prefix || (type === 'ipv6' ? 128 : 32)),
        type,
      );
    }
    return (request, response, next) => {
      if (!paths.test(request.path)) return next();
      const ip = (request.ip ?? '').replace(
        /^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/,
        '',
      );
      const type = isIPv4(ip) ? 'ipv4' : 'ipv6';
      if (ip && list.check(ip, type)) return next();
      ProblemDetails.send(
        response,
        403,
        'Not allowed from this network',
        request.originalUrl,
      );
    };
  }

  /**
   * Caps JSON depth and size after parsing, so a small but deeply nested or
   * very wide body cannot make validators and loggers burn CPU and memory.
   */
  static jsonLimits(config: AppConfig): RequestHandler {
    const {JSON_MAX_DEPTH, JSON_MAX_NODES} = config.env;
    return (request, response, next) => {
      if (typeof request.body !== 'object' || request.body === null)
        return next();
      let nodes = 0;
      const stack: [unknown, number][] = [[request.body, 1]];
      while (stack.length > 0) {
        const [value, depth] = stack.pop()!;
        if (++nodes > JSON_MAX_NODES || depth > JSON_MAX_DEPTH) {
          ProblemDetails.send(
            response,
            400,
            `JSON too complex (max depth ${JSON_MAX_DEPTH}, max ${JSON_MAX_NODES} values)`,
            request.originalUrl,
          );
          return;
        }
        if (typeof value === 'object' && value !== null) {
          for (const child of Object.values(value))
            stack.push([child, depth + 1]);
        }
      }
      next();
    };
  }

  /**
   * Answers 503 when a handler runs past HTTP_HANDLER_TIMEOUT_MS, so stuck
   * work (a hung query, a slow upstream) cannot pile up open requests.
   * Streams (SSE) are exempt.
   */
  static deadline(config: AppConfig): RequestHandler {
    const ms = config.env.HTTP_HANDLER_TIMEOUT_MS;
    return (request, response, next) => {
      if (String(request.headers.accept).includes('text/event-stream'))
        return next();
      const timer = setTimeout(() => {
        ProblemDetails.send(
          response,
          503,
          'Request timed out',
          request.originalUrl,
        );
      }, ms);
      const clear = () => clearTimeout(timer);
      response.on('finish', clear);
      response.on('close', clear);
      next();
    };
  }

  /**
   * API responses are not stored by browsers or shared proxies when the
   * request carried credentials or changed state (no-store); public reads may
   * be kept but must be revalidated with the ETag (no-cache).
   */
  static cacheControl(): RequestHandler {
    return (request, response, next) => {
      if (request.path.startsWith('/api/')) {
        const credentialed =
          request.headers.authorization !== undefined ||
          request.headers.cookie !== undefined;
        response.setHeader(
          'Cache-Control',
          credentialed || !RequestGuards.SAFE_METHODS.has(request.method)
            ? 'no-store'
            : 'no-cache',
        );
      }
      next();
    };
  }

  /**
   * One audit line per state-changing request: who (principal), what
   * (method, path), outcome (status), and the request id to correlate.
   */
  static auditLog(logger: Logger): RequestHandler {
    const audit = logger.child({audit: true});
    return (request, response, next) => {
      if (RequestGuards.SAFE_METHODS.has(request.method)) return next();
      const started = Date.now();
      response.on('finish', () => {
        const {principal} = request;
        audit.info(
          {
            requestId: response.getHeader('X-Request-Id'),
            principal: principal
              ? `${principal.strategy}:${principal.subject}`
              : null,
            method: request.method,
            path: request.originalUrl,
            status: response.statusCode,
            ip: request.ip,
            durationMs: Date.now() - started,
          },
          'audit',
        );
      });
      next();
    };
  }

  /**
   * Idempotency-Key on POST and PATCH (the non-idempotent methods): a client
   * that retries after a timeout gets the first response replayed instead of
   * creating a second record. The same key with a different body is 422; a
   * retry while the first is still running is 409. Keys are scoped to the
   * caller's credentials. Fails closed (503) if the cache is down.
   */
  static idempotency(config: AppConfig, store: CacheStore): RequestHandler {
    const ttl = config.env.IDEMPOTENCY_TTL_SECONDS;
    const prefix = `${config.env.CACHE_PREFIX}idem:`;
    const hash = (value: string | Buffer) =>
      createHash('sha256').update(value).digest('base64url');

    return async (request, response, next) => {
      const key = request.header('idempotency-key');
      if (
        key === undefined ||
        !(request.method === 'POST' || request.method === 'PATCH') ||
        !request.path.startsWith('/api/')
      ) {
        return next();
      }
      if (!/^[\x21-\x7e]{1,255}$/.test(key)) {
        ProblemDetails.send(
          response,
          400,
          'Idempotency-Key must be 1 to 255 visible characters',
          request.originalUrl,
        );
        return;
      }
      const caller = hash(
        request.headers.authorization ??
          request.headers.cookie ??
          request.ip ??
          '',
      );
      const storeKey = `${prefix}${caller}:${hash(key)}`;
      const fingerprint = hash(
        `${request.method} ${request.originalUrl}\n${request.rawBody ?? ''}`,
      );

      try {
        const saved = await store.get(storeKey);
        if (saved) {
          RequestGuards.replay(
            request,
            response,
            JSON.parse(saved),
            fingerprint,
          );
          return;
        }
        if (!(await store.setIfAbsent(`${storeKey}:lock`, '1', 60))) {
          ProblemDetails.send(
            response,
            409,
            'A request with this Idempotency-Key is in progress',
            request.originalUrl,
          );
          return;
        }
      } catch {
        ProblemDetails.send(
          response,
          503,
          'Idempotency store unavailable, retry later',
          request.originalUrl,
        );
        return;
      }

      const send = response.send.bind(response);
      let body: string | undefined;
      response.send = (payload?: unknown) => {
        body ??= Buffer.isBuffer(payload)
          ? payload.toString('utf8')
          : String(payload ?? '');
        return send(payload);
      };
      response.on('finish', () => {
        const record =
          response.statusCode < 500
            ? JSON.stringify({
                fingerprint,
                status: response.statusCode,
                headers: Object.fromEntries(
                  ['content-type', 'location', 'etag']
                    .map((name) => [name, response.getHeader(name)])
                    .filter(([, value]) => value !== undefined),
                ),
                body: body ?? '',
              })
            : null;
        const save = record
          ? store.set(storeKey, record, ttl)
          : Promise.resolve();
        void save
          .finally(() => store.delete(`${storeKey}:lock`))
          .catch(() => {});
      });
      next();
    };
  }

  private static replay(
    request: Request,
    response: Response,
    saved: {
      fingerprint: string;
      status: number;
      headers: Record<string, string>;
      body: string;
    },
    fingerprint: string,
  ): void {
    if (saved.fingerprint !== fingerprint) {
      ProblemDetails.send(
        response,
        422,
        'Idempotency-Key was already used for a different request',
        request.originalUrl,
      );
      return;
    }
    response
      .status(saved.status)
      .set(saved.headers)
      .set('Idempotent-Replayed', 'true');
    response.end(saved.body);
  }

  private static hostname(header: string | undefined): string | null {
    if (!header) return null;
    const host = header.startsWith('[')
      ? header.slice(1, header.indexOf(']'))
      : header.replace(/:\d+$/, '');
    return host.toLowerCase() || null;
  }
}
