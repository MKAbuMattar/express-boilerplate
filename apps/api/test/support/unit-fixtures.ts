import {AppConfig} from '@express-boilerplate/common/config/app.config.js';
import {MemoryCacheStore} from '@express-boilerplate/common/config/cache/memory-cache.store.js';
import {JwtKeys} from '@express-boilerplate/common/security/jwt/jwt-keys.js';
import {TokenProvider} from '@express-boilerplate/common/security/jwt/token.provider.js';
import {TokenRevocation} from '@express-boilerplate/common/security/jwt/token-revocation.js';
import {AppLogger} from '@express-boilerplate/common/util/app-logger.js';
import type {Request} from 'express';

/** Small builders for unit tests that run classes without the app. */
export class UnitFixtures {
  static config(env: Record<string, string> = {}): AppConfig {
    return new AppConfig({NODE_ENV: 'test', ...env});
  }

  static request(init: {
    method?: string;
    originalUrl?: string;
    headers?: Record<string, string>;
    rawBody?: Buffer;
    cookies?: Record<string, string>;
  }): Request {
    const headers = Object.fromEntries(
      Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
    return {
      method: init.method ?? 'GET',
      originalUrl: init.originalUrl ?? '/',
      headers,
      rawBody: init.rawBody,
      cookies: init.cookies ?? {},
      socket: {},
      header: (name: string) => headers[name.toLowerCase()],
    } as unknown as Request;
  }
}

/** A TokenProvider without the container: memory revocation store. */
export class TokenProviders {
  static build(
    config: AppConfig,
    store = new MemoryCacheStore(),
  ): TokenProvider {
    return new TokenProvider(
      config,
      new JwtKeys(config),
      new TokenRevocation(store, config, new AppLogger(config)),
    );
  }
}
