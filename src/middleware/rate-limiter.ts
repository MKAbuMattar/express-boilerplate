import type {RequestHandler} from 'express';
import type {AppConfig} from '../config/app.config.js';
import type {CacheStore} from '../config/cache/cache-store.js';
import {ProblemDetails} from '../exceptions/problem-details.js';

/**
 * Fixed-window rate limit per client IP, stored in the CacheStore, so with
 * CACHE_TYPE=redis every instance shares the same counters.
 *
 * Two buckets: /auth (login, callbacks: brute-force target) gets the strict
 * RATE_LIMIT_AUTH_MAX, everything else RATE_LIMIT_MAX. Health checks are
 * exempt so a load balancer is never locked out.
 *
 * Behind a proxy set TRUST_PROXY to the hop count, or every client shares the
 * proxy's IP.
 * If the cache is down the limiter lets requests through (fail open):
 * losing rate limiting beats losing the API.
 */
export class RateLimiter {
  private static readonly EXEMPT = /^\/api\/(v\d+\/)?health(\/|$)/;

  static middleware(config: AppConfig, store: CacheStore): RequestHandler {
    const {
      RATE_LIMIT_ENABLED,
      RATE_LIMIT_WINDOW_SECONDS: window,
      RATE_LIMIT_MAX,
      RATE_LIMIT_AUTH_MAX,
      CACHE_PREFIX,
    } = config.env;

    return async (request, response, next) => {
      if (!RATE_LIMIT_ENABLED || RateLimiter.EXEMPT.test(request.path)) {
        return next();
      }
      const isAuth = request.path.startsWith('/auth/');
      const limit = isAuth ? RATE_LIMIT_AUTH_MAX : RATE_LIMIT_MAX;
      const bucket = isAuth ? 'auth' : 'api';
      const key = `${CACHE_PREFIX}rl:${bucket}:${request.ip ?? 'unknown'}`;

      let count: number;
      let resetSeconds: number;
      try {
        ({count, resetSeconds} = await store.increment(key, window));
      } catch {
        return next();
      }

      response.setHeader('RateLimit-Limit', String(limit));
      response.setHeader(
        'RateLimit-Remaining',
        String(Math.max(0, limit - count)),
      );
      response.setHeader('RateLimit-Reset', String(resetSeconds));
      if (count > limit) {
        ProblemDetails.send(
          response,
          429,
          'Rate limit exceeded, retry later',
          request.originalUrl,
          {'Retry-After': String(resetSeconds)},
        );
        return;
      }
      next();
    };
  }
}
