import type {Request} from 'express';
import {AppConfig} from '../../src/config/app.config.js';

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
