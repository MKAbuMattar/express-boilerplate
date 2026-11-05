import {isHttpResponse} from '@inversifyjs/http-core';
import {describe, expect, it, vi} from 'vitest';
import {MemoryCacheStore} from '../../src/config/cache/memory-cache.store.js';
import {HmacGuard} from '../../src/security/hmac/hmac.guard.js';
import {CacheServiceImpl} from '../../src/service/impl/cache.service.impl.js';
import {AppLogger} from '../../src/util/app-logger.js';
import {UnitFixtures} from '../support/unit-fixtures.js';

describe('HmacGuard', () => {
  const SECRET = 'unit-secret';
  const body = Buffer.from('{"amount":10}');
  const build = (hmacClients = `client-a:${SECRET}`) => {
    const config = UnitFixtures.config({HMAC_CLIENTS: hmacClients});
    const store = new MemoryCacheStore();
    const cache = new CacheServiceImpl(store, config, new AppLogger(config));
    return {guard: new HmacGuard(config, cache), store};
  };
  const signedRequest = (
    overrides: {
      secret?: string;
      ts?: string;
      client?: string;
      url?: string;
    } = {},
  ) => {
    const ts = overrides.ts ?? String(Math.floor(Date.now() / 1000));
    const url = overrides.url ?? '/api/secure/hmac';
    return UnitFixtures.request({
      method: 'POST',
      originalUrl: '/api/secure/hmac',
      rawBody: body,
      headers: {
        'x-client-id': overrides.client ?? 'client-a',
        'x-timestamp': ts,
        'x-signature': HmacGuard.sign(
          overrides.secret ?? SECRET,
          ts,
          'POST',
          url,
          body,
        ),
      },
    });
  };
  const statusOf = async (promise: Promise<unknown>) => {
    try {
      await promise;
      return 200;
    } catch (error) {
      return isHttpResponse(error) ? error.statusCode : -1;
    }
  };

  it('accepts a valid signature and sets the principal', async () => {
    const {guard} = build();
    const request = signedRequest();
    expect(await guard.activate(request)).toBe(true);
    expect(request.principal).toMatchObject({
      strategy: 'hmac',
      subject: 'client-a',
    });
  });

  it.each([
    ['wrong secret', {secret: 'nope'}],
    ['unknown client', {client: 'client-z'}],
    ['stale timestamp', {ts: String(Math.floor(Date.now() / 1000) - 600)}],
    ['future timestamp', {ts: String(Math.floor(Date.now() / 1000) + 600)}],
    ['non-numeric timestamp', {ts: 'abc'}],
    ['signature over another path', {url: '/api/other'}],
  ])('rejects %s with 401', async (_label, overrides) => {
    const {guard} = build();
    expect(await statusOf(guard.activate(signedRequest(overrides)))).toBe(401);
  });

  it('rejects a replay of the same signature', async () => {
    const {guard} = build();
    const request = signedRequest();
    await guard.activate(request);
    expect(await statusOf(guard.activate(request))).toBe(401);
  });

  it('returns 501 when no clients are configured', async () => {
    const {guard} = build('');
    expect(await statusOf(guard.activate(signedRequest()))).toBe(501);
  });

  it('fails closed with 503 when the replay store is down', async () => {
    const {guard, store} = build();
    vi.spyOn(store, 'setIfAbsent').mockRejectedValue(new Error('down'));
    expect(await statusOf(guard.activate(signedRequest()))).toBe(503);
  });
});
