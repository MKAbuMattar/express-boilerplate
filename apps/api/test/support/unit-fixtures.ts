import type {Request} from 'express';
import {AppConfig} from '../../src/config/app.config.js';
import {MemoryCacheStore} from '../../src/config/cache/memory-cache.store.js';
import {JwtKeys} from '../../src/security/jwt/jwt-keys.js';
import {TokenProvider} from '../../src/security/jwt/token.provider.js';
import {TokenRevocation} from '../../src/security/jwt/token-revocation.js';
import {AppLogger} from '../../src/util/app-logger.js';

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
